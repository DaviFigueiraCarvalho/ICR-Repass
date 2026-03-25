const CONFIG = {
    apiBaseUrl: 'https://sua-api.com', // Substitua pela URL real da API C#
};

const churchSelect = document.getElementById('church');
const referenceSelect = document.getElementById('reference');
const amountInput = document.getElementById('amount');
const form = document.getElementById('repassForm');
const errorMsg = document.getElementById('errorMsg');
const successArea = document.getElementById('successArea');
const paymentArea = document.getElementById('paymentArea');
const btnSubmit = document.getElementById('btnSubmit');
const btnNew = document.getElementById('btnNew');
const repassePreview = document.getElementById('repassePreview');
const previewAmountSpan = document.getElementById('previewAmount');
const btnCopyPix = document.getElementById('btnCopyPix');
const btnPayPix = document.getElementById('btnPayPix');
const waitingPaymentDiv = document.getElementById('waitingPayment');
const paymentErrorMsg = document.getElementById('paymentErrorMsg');

// Stores data from the pending payment while waiting for confirmation
let pendingPayment = null;
let pollingInterval = null;

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
}

function hideError() {
    errorMsg.classList.add('hidden');
    errorMsg.textContent = '';
}

function showPaymentError(message) {
    paymentErrorMsg.textContent = message;
    paymentErrorMsg.classList.remove('hidden');
    waitingPaymentDiv.classList.add('hidden');
}

function formatCurrency(value) {
    return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Returns 10% of the given amount, rounded to 2 decimal places
function calculateRepasse(amount) {
    return Math.round(amount * 0.10 * 100) / 100;
}

async function loadChurches() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/api/churches`);
        if (!response.ok) throw new Error('Falha ao carregar igrejas');
        const churches = await response.json();

        churchSelect.innerHTML = '<option value="">Selecione sua igreja...</option>';
        churches.forEach((church) => {
            const option = document.createElement('option');
            option.value = church.id;
            option.textContent = church.name;
            churchSelect.appendChild(option);
        });
    } catch (error) {
        churchSelect.innerHTML = '<option value="" disabled>Não foi possível carregar</option>';
        churchSelect.disabled = true;
        showError('Não foi possível carregar as igrejas. Verifique sua conexão e recarregue a página.');
        console.error('Erro ao carregar igrejas:', error);
    }
}

async function loadReferences() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/api/repasses/references`);
        if (!response.ok) throw new Error('Falha ao carregar referências');
        const references = await response.json();

        referenceSelect.innerHTML = '<option value="">Selecione a referência...</option>';
        references.forEach((ref) => {
            const option = document.createElement('option');
            option.value = ref.id;
            option.textContent = ref.name ?? ref.id;
            referenceSelect.appendChild(option);
        });
    } catch (error) {
        referenceSelect.innerHTML = '<option value="" disabled>Não foi possível carregar</option>';
        referenceSelect.disabled = true;
        showError('Não foi possível carregar as referências. Verifique sua conexão e recarregue a página.');
        console.error('Erro ao carregar referências:', error);
    }
}

// Updates the repasse preview when the user types an amount
amountInput.addEventListener('input', () => {
    const amount = parseFloat(amountInput.value);
    if (amount > 0) {
        previewAmountSpan.textContent = formatCurrency(calculateRepasse(amount));
        repassePreview.classList.remove('hidden');
    } else {
        repassePreview.classList.add('hidden');
    }
});

// Calls the backend to create a Pix payment order via Pagar.me
async function createPixPayment(churchId, reference, repasseAmount) {
    const response = await fetch(`${CONFIG.apiBaseUrl}/api/pagamentos/pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ churchId, reference, amount: repasseAmount }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
            errorData?.message ||
            errorData?.title ||
            `Erro ${response.status}: não foi possível gerar o QR Code Pix.`
        );
    }

    return response.json();
}

// Shows the payment area with the QR Code and Pix copy-paste code
function showPaymentArea(pixData, repasseAmount) {
    document.getElementById('pixAmount').textContent = formatCurrency(repasseAmount);
    document.getElementById('pixQrCode').src = `data:image/png;base64,${pixData.qrCodeBase64}`;
    document.getElementById('pixCode').value = pixData.qrCodeText;
    btnPayPix.href = pixData.paymentUrl;

    paymentErrorMsg.classList.add('hidden');
    waitingPaymentDiv.classList.remove('hidden');

    form.classList.add('hidden');
    document.querySelector('.header').classList.add('hidden');
    paymentArea.classList.remove('hidden');
}

// Shows the success screen after payment is confirmed
function showSuccessScreen() {
    if (!pendingPayment) return;

    document.getElementById('resChurch').textContent =
        churchSelect.options[churchSelect.selectedIndex].text;
    document.getElementById('resReference').textContent =
        referenceSelect.options[referenceSelect.selectedIndex].text;
    document.getElementById('resAmountTotal').textContent = formatCurrency(pendingPayment.amount);
    document.getElementById('resAmount').textContent = formatCurrency(pendingPayment.repasseAmount);

    paymentArea.classList.add('hidden');
    successArea.classList.remove('hidden');
}

const POLLING_INTERVAL_MS = 5000;
const MAX_POLLING_ATTEMPTS = 120; // up to 10 minutes (120 × 5 s)

// Polls the backend every 5 seconds to check if the payment was confirmed
function startPolling(orderId) {
    let attempts = 0;

    pollingInterval = setInterval(async () => {
        attempts++;

        if (attempts > MAX_POLLING_ATTEMPTS) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            showPaymentError('Tempo limite de pagamento excedido. Retorne ao formulário e tente novamente.');
            return;
        }

        try {
            const response = await fetch(`${CONFIG.apiBaseUrl}/api/pagamentos/pix/${orderId}/status`);
            if (!response.ok) return;

            const { status } = await response.json();

            if (status === 'paid') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                showSuccessScreen();
            } else if (status === 'failed') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                showPaymentError('Pagamento não aprovado. Retorne ao formulário e tente novamente.');
            }
        } catch (error) {
            console.error('Erro ao verificar status do pagamento:', error);
        }
    }, POLLING_INTERVAL_MS);
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const churchId = Number(churchSelect.value);
    const reference = Number(referenceSelect.value);
    const amount = parseFloat(amountInput.value);

    if (!churchId) {
        showError('Por favor, selecione uma igreja.');
        return;
    }
    if (!reference) {
        showError('Por favor, selecione uma referência.');
        return;
    }
    if (!amount || amount <= 0) {
        showError('Por favor, informe um valor válido maior que zero.');
        return;
    }

    const repasseAmount = calculateRepasse(amount);

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="material-icons">hourglass_top</span> Gerando QR Code...';

    try {
        const pixData = await createPixPayment(churchId, reference, repasseAmount);

        pendingPayment = { churchId, reference, amount, repasseAmount, orderId: pixData.orderId };

        showPaymentArea(pixData, repasseAmount);
        startPolling(pixData.orderId);
    } catch (error) {
        console.error('Erro ao gerar pagamento Pix:', error);
        showError(error.message || 'Não foi possível gerar o QR Code Pix. Tente novamente.');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span class="material-icons">pix</span> Gerar QR Code Pix';
    }
});

btnCopyPix.addEventListener('click', () => {
    const pixCode = document.getElementById('pixCode');
    navigator.clipboard.writeText(pixCode.value).then(() => {
        btnCopyPix.innerHTML = '<span class="material-icons">check</span>';
        setTimeout(() => {
            btnCopyPix.innerHTML = '<span class="material-icons">content_copy</span>';
        }, 2000);
    }).catch(() => {
        showPaymentError('Não foi possível copiar o código. Selecione e copie manualmente.');
    });
});

btnNew.addEventListener('click', () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    pendingPayment = null;

    form.reset();
    hideError();
    repassePreview.classList.add('hidden');
    successArea.classList.add('hidden');
    paymentArea.classList.add('hidden');
    form.classList.remove('hidden');
    document.querySelector('.header').classList.remove('hidden');
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span class="material-icons">pix</span> Gerar QR Code Pix';
});

loadChurches();
loadReferences();
