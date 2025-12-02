// Configurações MQTT
const ClientId = 'esp32_' + Math.floor(Math.random() * 10000);
const clientWeb = new Paho.MQTT.Client("broker.hivemq.com", 8884, "/mqtt", ClientId);

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

// Atualizar status de conexão
function updateConnectionStatus(status) {
    statusIndicator.className = 'status-indicator';
    isConnected = status === 'connected';

    switch (status) {
        case 'connected':
            statusIndicator.classList.add('connected');
            statusText.textContent = 'Conectado';
            reconnectAttempts = 0; // Resetar tentativas
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

// Notificação personalizada
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

    if (!isCritical) {
        setTimeout(() => { customNotification.style.display = 'none'; }, 3000);
    }
}

// Fechar notificação
notificationClose.addEventListener('click', function () {
    customNotification.style.display = 'none';
});

// Atualizar valor do PPM
function escreverValor(valor) {
    const valorNum = parseInt(valor);
    if (Number.isNaN(valorNum)) return;

    document.getElementById('valor-ppm').textContent = valorNum;
    const statusTitle = document.getElementById('status-ppm-title');
    const statusDesc = document.getElementById('status-ppm');

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
    } else {
        statusTitle.textContent = 'Alto Risco';
        statusTitle.classList.add('status-high-risk');
        statusDesc.textContent = 'Aceleração da respiração, sincope e possível morte';
        showCustomNotification('ALERTA CRÍTICO: Alto Risco', 'Níveis de CO2 perigosos detectados! Tome medidas imediatas para ventilar a área.', true);

        if ("Notification" in window && Notification.permission === "granted") {
            new Notification('Alerta: Gás detectado', {
                body: 'Níveis de CO2 perigosos detectados! Tome medidas imediatas para ventilar a área.',
                icon: 'icon.png',
                tag: 'critical-alert'
            });
        }
    }
}

// Conectar ao broker
function connectToBroker() {
    if (clientWeb.isConnected() || clientWeb._connectTimeout) {
        console.log("Já está conectado ou conexão em andamento — não tentando conectar.");
        return;
    }

    updateConnectionStatus('connecting');

    clientWeb.connect({
        useSSL: true,
        timeout: 10,
        onSuccess: function () {
            console.log('Conectado ao Broker MQTT');
            updateConnectionStatus('connected');
            reconnectAttempts = 0;

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

// Reconectar com controle de tentativas
function attemptReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('Número máximo de tentativas de reconexão atingido');
        showCustomNotification('Falha na Conexão', 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.');
        return;
    }

    reconnectAttempts++;
    console.log(`Tentativa de reconexão ${reconnectAttempts}/${maxReconnectAttempts}`);

    if (reconnectTimer) clearTimeout(reconnectTimer);

    reconnectTimer = setTimeout(() => { connectToBroker(); }, reconnectInterval);
}

// Callbacks MQTT
clientWeb.onConnectionLost = function (responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log('Conexão perdida: ' + responseObject.errorMessage);
        updateConnectionStatus('disconnected');

        if (responseObject.errorCode !== 7) {
            attemptReconnect();
        }
    }
};

clientWeb.onMessageArrived = function (message) {
    console.log('Mensagem recebida: ' + message.payloadString);
    escreverValor(message.payloadString);
};

clientWeb.onConnected = function (reconnect, uri) {
    console.log('Callback onConnected: reconnect=' + reconnect + ', uri=' + uri);
};

// Inicialização
document.addEventListener('DOMContentLoaded', function () {
    connectToBroker();

    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
});

// Reconectar quando aba ganhar foco
window.addEventListener('focus', function () {
    if (!clientWeb.isConnected()) {
        console.log("Janela em foco - reconectar");
        attemptReconnect();
    }
});

// Limpar timers e desconectar ao fechar página
window.addEventListener('beforeunload', function () {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (clientWeb.isConnected()) clientWeb.disconnect();
});
