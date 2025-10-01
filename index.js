// Configurações MQTT
const ClientId = 'esp32_' + Math.floor(Math.random() * 10000);
const clientWeb = new Paho.MQTT.Client('broker.hivemq.com', 8884, ClientId);

// Variáveis de controle
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectInterval = 5000; // 5 segundos
let reconnectTimer = null;

// Elementos da UI
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const customNotification = document.getElementById('customNotification');
const notificationTitle = document.getElementById('notificationTitle');
const notificationBody = document.getElementById('notificationBody');
const notificationClose = document.getElementById('notificationClose');

// Função para atualizar status de conexão
function updateConnectionStatus(status) {
    statusIndicator.className = 'status-indicator';
    isConnected = status === 'connected';

    switch (status) {
        case 'connected':
            statusIndicator.classList.add('connected');
            statusText.textContent = 'Conectado';
            reconnectAttempts = 0; // Resetar tentativas em conexão bem-sucedida
            break;
        case 'connecting':
            statusIndicator.classList.add('connecting');
            statusText.textContent = 'Conectando...';
            break;
        case 'disconnected':
            statusIndicator.classList.add('disconnected');
            statusText.textContent = 'Desconectado';
            break;
    }
}

// Função para mostrar notificação personalizada
function showCustomNotification(title, body, isCritical = false) {
    notificationTitle.textContent = title;
    notificationBody.textContent = body;

    if (isCritical) {
        customNotification.style.backgroundColor = '#8B0000';
        customNotification.style.animation = 'alert-pulse 1.5s infinite';
    } else {
        customNotification.style.backgroundColor = '#009900';
        customNotification.style.animation = 'none';
    }

    customNotification.style.display = 'block';

    // Auto-ocultar após 10 segundos para alertas não críticos
    if (!isCritical) {
        setTimeout(() => {
            customNotification.style.display = 'none';
        }, 3000);
    }
}

// Fechar notificação
notificationClose.addEventListener('click', function () {
    customNotification.style.display = 'none';
});

// Função para escrever valor e atualizar status
function escreverValor(valor) {
    const valorNum = parseInt(valor);
    document.getElementById('valor-ppm').textContent = valorNum;

    const statusTitle = document.getElementById('status-ppm-title');
    const statusDesc = document.getElementById('status-ppm');

    // Resetar classes de status
    statusTitle.className = 'status-title';

    if (valorNum < 10) {
        statusTitle.textContent = 'Seguro';
        statusTitle.classList.add('status-safe');
        statusDesc.textContent = 'Sem Efeitos';
    } else if (valorNum < 100) {
        statusTitle.textContent = 'Atenção';
        statusTitle.classList.add('status-warning');
        statusDesc.textContent = 'Ligeira Cefaleia (dor de cabeça)';
    } else if (valorNum < 500) {
        statusTitle.textContent = 'Alerta';
        statusTitle.classList.add('status-alert');
        statusDesc.textContent = 'Cefaleia, Vertigens e tendências ao desmaio';
        
    } else if (valorNum < 1000) {
        statusTitle.textContent = 'Alto Risco';
        statusTitle.classList.add('status-high-risk');
        statusDesc.textContent = 'Aceleração da respiração, sincope e possivel morte';
        showCustomNotification('ALERTA CRÍTICO: Alto Risco', 'Níveis de CO2 perigosos detectados! Tome medidas imediatas para ventilar a área.', true);

        // Tentar usar notificação do navegador se disponível
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification('Alerta: Gás detectado', {
                body: 'Níveis de CO2 perigosos detectados! Tome medidas imediatas para ventilar a área.',
                icon: 'icon.png',
                tag: 'critical-alert'
            });
        }
    }
}

// Função para conectar ao broker
function connectToBroker() {
    if (isConnected) return;

    updateConnectionStatus('connecting');

    clientWeb.connect({
        useSSL: true,
        timeout: 10,
        onSuccess: function () {
            console.log('Conectado ao Broker MQTT');
            updateConnectionStatus('connected');
            clientWeb.subscribe('sinala/ppm/value');
            showCustomNotification('Conexão Estabelecida', 'Conectado ao servidor MQTT com sucesso.');
        },
        onFailure: function (e) {
            console.log('Erro na conexão: ' + e.errorMessage);
            updateConnectionStatus('disconnected');
            attemptReconnect();
        }
    });
}

// Função para tentar reconexão
function attemptReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('Número máximo de tentativas de reconexão atingido');
        showCustomNotification('Falha na Conexão', 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.');
        return;
    }

    reconnectAttempts++;
    console.log(`Tentativa de reconexão ${reconnectAttempts}/${maxReconnectAttempts}`);

    reconnectTimer = setTimeout(function () {
        connectToBroker();
    }, reconnectInterval);
}

// Configurar callbacks do cliente MQTT
clientWeb.onConnectionLost = function (responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log('Conexão perdida: ' + responseObject.errorMessage);
        updateConnectionStatus('disconnected');

        if (responseObject.errorCode !== 7) { // 7 = desconexão manual
            attemptReconnect();
        }
    }
};

clientWeb.onMessageArrived = function (message) {
    console.log('Mensagem recebida: ' + message.payloadString);
    escreverValor(message.payloadString);
};

// Callbacks adicionais para melhor controle
clientWeb.onConnected = function (reconnect, uri) {
    console.log('Callback onConnected: reconnect=' + reconnect + ', uri=' + uri);
};

// Iniciar conexão quando a página carregar
document.addEventListener('DOMContentLoaded', function () {
    connectToBroker();

    // Solicitar permissão para notificações
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
});

// Tentar reconectar quando a janela ganhar foco (usuário retornou à aba)
window.addEventListener('focus', function () {
    if (!isConnected && reconnectAttempts < maxReconnectAttempts) {
        console.log('Janela em foco - tentando reconectar');
        connectToBroker();
    }
});

// Limpar timer quando a página for fechada
window.addEventListener('beforeunload', function () {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }
    if (clientWeb.isConnected()) {
        clientWeb.disconnect();
    }
});