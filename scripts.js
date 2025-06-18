
// Quand un visiteur arrive sur la page, créer un événement de session sur GA
gtag('event', 'tuteur_session_start', {
    'user_agent': navigator.userAgent
});

// Configuration
const MAX_QUESTIONS_PER_SESSION = 20;
let questionCount = 0;
let conversationHistory = [];

// Fonction pour échapper les caractères HTML
// Note: Il y a un problème, les apostrophes sont encodées même dans le texte courant...Je vais le corriger plus tard, probablement juste encoder ce qu'il y a encore ```ou ` à suivre...
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Fonction pour appeler l'API via Netlify Functions
async function callTutorAPI(message, history) {
    try {
        const response = await fetch('/.netlify/functions/tutor-ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                history: history.slice(-10) // Limiter l'historique pour économiser les tokens
            })
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error('Erreur API:', error);
        throw error;
    }
}

// Gestion des éléments DOM
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const questionCountElement = document.getElementById('questionCount');

function updateQuestionCounter() {
    questionCountElement.textContent = questionCount;
    if (questionCount >= MAX_QUESTIONS_PER_SESSION) {
        messageInput.disabled = true;
        sendButton.disabled = true;
        addMessage("⚠️ Limite de questions atteinte pour cette session. Cliquez sur 'Nouvelle conversation' pour recommencer.");
    }
}

function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    escapedContent = escapeHtml(content);

    // Formatage du contenu avec support markdown basique
    let formattedContent = escapedContent
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');

    contentDiv.innerHTML = formattedContent;

    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.innerHTML = '<div class="message-content loading">Le tuteur réfléchit<span class="loading-dots"></span></div>';
    loadingDiv.id = 'loading-message';
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideLoading() {
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) {
        loadingMessage.remove();
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.innerHTML = `❌ <strong>Erreur:</strong> ${message}`;
    document.querySelector('.chat-container').insertBefore(errorDiv, document.querySelector('.messages'));

    setTimeout(() => {
        errorDiv.remove();
    }, 10000);
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || questionCount >= MAX_QUESTIONS_PER_SESSION) return;

    // Ajouter le message de l'utilisateur
    addMessage(message, true);
    conversationHistory.push({ role: 'user', content: message });

    messageInput.value = '';
    sendButton.disabled = true;
    questionCount++;
    updateQuestionCounter();

    // Montrer le loading
    showLoading();

    // 🔥 TRACKING : Question posée
    gtag('event', 'question_asked', {
        'question_text': message,
        'question_length': message.length,
        'timestamp': new Date().toISOString()
    });

    try {
        // Appeler l'API
        const response = await callTutorAPI(message, conversationHistory);

        hideLoading();
        formattedResponse = escapeHtml(response);
        addMessage(formattedResponse);
        conversationHistory.push({ role: 'assistant', content: formattedResponse });

    } catch (error) {
        hideLoading();
        showError('Impossible de contacter le tuteur IA. Vérifiez votre connexion ou réessayez plus tard.');
        console.error('Erreur:', error);
    }

    sendButton.disabled = false;
    autoResize();
    messageInput.focus();
}

function clearChat() {
    messagesContainer.innerHTML = `
                <div class="message assistant">
                    <div class="message-content">
                        👋 Nouvelle conversation démarrée ! Je suis prêt à vous aider avec vos questions de développement web.
                        <br><br>
                        Partagez votre code, décrivez votre problème ou posez votre question&nbsp;!
                    </div>
                </div>
            `;
    conversationHistory = [];
    questionCount = 0;
    updateQuestionCounter();
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
}

function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

// Event listeners
sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

messageInput.addEventListener('input', autoResize);

// Focus initial
messageInput.focus();
updateQuestionCounter();
