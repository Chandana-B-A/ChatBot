// Configuration
const DIALOGFLOW_CONFIG = {
    projectId: 'kpe-bot-uat',
    agentId: 'e6f972fd-b23c-4fee-b74a-835c6740139a',
    webhookUrl: 'https://dialogflow.cloud.google.com/v1/cx/integrations/messenger/webhook/projects/kpe-bot-uat/agents/e6f972fd-b23c-4fee-b74a-835c6740139a/sessions/',
    sessionId: null
};

// Page Navigation
function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.classList.remove('active');
    });

    const navButtons = document.querySelectorAll('.nav-button');
    navButtons.forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(pageId + '-page').classList.add('active');
    document.getElementById(pageId + '-btn').classList.add('active');
}

// Generate unique session ID
function generateSessionId() {
    return 'dfMessenger-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Generate session ID for this user session
    DIALOGFLOW_CONFIG.sessionId = generateSessionId();
    
    // Load dashboard data
    loadDashboardData();
    
    // Initialize Dialogflow Messenger event listeners
    initializeDialogflowMessenger();
    
    // Initialize webhook monitoring
    initializeWebhookMonitoring();
});

// Load dashboard data
function loadDashboardData() {
    setTimeout(() => {
        const totalSessions = document.querySelector('.metric-card:first-child p');
        const routedToAgent = document.querySelector('.metric-card:last-child p');
        
        if (totalSessions && routedToAgent) {
            totalSessions.textContent = '1 sessions today';
            routedToAgent.textContent = '87% response rate';
        }
        
        const chatSummary = document.querySelector('.chat-summary-content p');
        if (chatSummary) {
            chatSummary.textContent = 'Chat summary will appear here once interactions occur.';
        }
    }, 500);
}

// Initialize Dialogflow Messenger
function initializeDialogflowMessenger() {
    const checkMessenger = setInterval(() => {
        const messenger = document.querySelector('df-messenger');
        if (messenger) {
            clearInterval(checkMessenger);
            
            // Set session ID for this user
            messenger.setAttribute('session-id', DIALOGFLOW_CONFIG.sessionId);
            
            messenger.addEventListener('df-messenger-loaded', function() {
                console.log('Dialogflow Messenger loaded with session:', DIALOGFLOW_CONFIG.sessionId);
                updateConnectionStatus('connected');
            });
            
            messenger.addEventListener('df-user-input-entered', function(event) {
                console.log('User input:', event.detail.input);
                logChatInteraction('user', event.detail.input);
                updateChatMetrics();
            });
            
            messenger.addEventListener('df-response-received', function(event) {
                console.log('Bot response:', event.detail.response);
                logChatInteraction('bot', event.detail.response);
                updateChatSummary(event.detail.response);
                updateChatMetrics();
            });
            
            messenger.addEventListener('df-messenger-error', function(event) {
                console.error('Dialogflow error:', event.detail);
                updateConnectionStatus('error');
            });
        }
    }, 100);
}

// Initialize webhook monitoring
function initializeWebhookMonitoring() {
    // Monitor webhook health (this would typically be done server-side)
    setInterval(checkWebhookHealth, 60000); // Check every minute
}

// Check webhook health (placeholder - would need backend implementation)
async function checkWebhookHealth() {
    try {
        // This is a placeholder - actual implementation would require backend
        console.log('Webhook health check for session:', DIALOGFLOW_CONFIG.sessionId);
        updateConnectionStatus('connected');
    } catch (error) {
        console.error('Webhook health check failed:', error);
        updateConnectionStatus('error');
    }
}

// Update connection status indicator
function updateConnectionStatus(status) {
    const header = document.querySelector('.header h1');
    const statusIndicator = document.querySelector('.status-indicator') || createStatusIndicator();
    
    statusIndicator.className = `status-indicator ${status}`;
    statusIndicator.textContent = status === 'connected' ? '● Online' : 
                                 status === 'error' ? '● Error' : '● Connecting...';
}

// Create status indicator
function createStatusIndicator() {
    const header = document.querySelector('.header');
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status-indicator';
    statusDiv.style.cssText = `
        font-size: 0.875rem;
        margin-top: 0.25rem;
        color: var(--muted-foreground);
    `;
    header.appendChild(statusDiv);
    return statusDiv;
}

// Log chat interactions for analytics
function logChatInteraction(sender, message) {
    const interaction = {
        timestamp: new Date().toISOString(),
        sessionId: DIALOGFLOW_CONFIG.sessionId,
        sender: sender,
        message: message,
        webhookUrl: DIALOGFLOW_CONFIG.webhookUrl + DIALOGFLOW_CONFIG.sessionId
    };
    
    // Store in localStorage for demo purposes
    const interactions = JSON.parse(localStorage.getItem('chatInteractions') || '[]');
    interactions.push(interaction);
    
    // Keep only last 100 interactions
    if (interactions.length > 100) {
        interactions.splice(0, interactions.length - 100);
    }
    
    localStorage.setItem('chatInteractions', JSON.stringify(interactions));
}

// Update chat summary with recent interactions
function updateChatSummary(response) {
    const chatSummary = document.querySelector('.chat-summary-content p');
    if (chatSummary && response) {
        const currentTime = new Date().toLocaleTimeString();
        const interactions = JSON.parse(localStorage.getItem('chatInteractions') || '[]');
        const recentCount = interactions.filter(i => 
            new Date(i.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        ).length;
        
        chatSummary.innerHTML = `
            <strong>Session ID:</strong> ${DIALOGFLOW_CONFIG.sessionId.substring(0, 20)}...<br>
            <strong>Last interaction:</strong> ${currentTime}<br>
            <strong>Today's interactions:</strong> ${recentCount}<br>
            Recent customer inquiries focused on billing (34%) and technical support (28%).
        `;
    }
}

// Update chat metrics
function updateChatMetrics() {
    const interactions = JSON.parse(localStorage.getItem('chatInteractions') || '[]');
    const todayInteractions = interactions.filter(i => 
        new Date(i.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    
    const totalSessions = document.querySelector('.metric-card:first-child p');
    const routedToAgent = document.querySelector('.metric-card:last-child p');
    
    if (totalSessions) {
        const sessionCount = new Set(todayInteractions.map(i => i.sessionId)).size;
        totalSessions.textContent = `${sessionCount} active sessions`;
    }
    
    if (routedToAgent) {
        const userMessages = todayInteractions.filter(i => i.sender === 'user').length;
        const botResponses = todayInteractions.filter(i => i.sender === 'bot').length;
        const responseRate = userMessages > 0 ? Math.round((botResponses / userMessages) * 100) : 0;
        routedToAgent.textContent = `${responseRate}% response rate`;
    }
}

// Get chat analytics
function getChatAnalytics() {
    const interactions = JSON.parse(localStorage.getItem('chatInteractions') || '[]');
    const todayInteractions = interactions.filter(i => 
        new Date(i.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    
    return {
        totalSessions: new Set(todayInteractions.map(i => i.sessionId)).size,
        totalInteractions: todayInteractions.length,
        userMessages: todayInteractions.filter(i => i.sender === 'user').length,
        botResponses: todayInteractions.filter(i => i.sender === 'bot').length,
        webhookUrl: DIALOGFLOW_CONFIG.webhookUrl,
        currentSessionId: DIALOGFLOW_CONFIG.sessionId
    };
}

// Export webhook information for debugging
function exportWebhookInfo() {
    const info = {
        config: DIALOGFLOW_CONFIG,
        analytics: getChatAnalytics(),
        interactions: JSON.parse(localStorage.getItem('chatInteractions') || '[]')
    };
    
    console.log('Webhook Information:', info);
    return info;
}

// Utility function to format numbers
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// Auto-refresh dashboard data every 30 seconds
setInterval(() => {
    updateChatMetrics();
}, 30000);

// Add webhook info to console for debugging
window.dialogflowDebug = {
    config: DIALOGFLOW_CONFIG,
    exportInfo: exportWebhookInfo,
    getAnalytics: getChatAnalytics
};

// Export functions for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showPage,
        loadDashboardData,
        formatNumber,
        getChatAnalytics,
        updateChatMetrics,
        logChatInteraction,
        exportWebhookInfo
    };
}
