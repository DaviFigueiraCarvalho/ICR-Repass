const CONFIG = {
    apiBaseUrl: 'https://sua-api.com', // Substitua pela URL real da API C#
};

const churchSelect = document.getElementById('church');
const referenceSelect = document.getElementById('reference');
const amountInput = document.getElementById('amount');
const form = document.getElementById('repassForm');
const errorMsg = document.getElementById('errorMsg');
const successArea = document.getElementById('successArea');
const btnSubmit = document.getElementById('btnSubmit');
const btnNew = document.getElementById('btnNew');

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
}

function hideError() {
    errorMsg.classList.add('hidden');
    errorMsg.textContent = '';
}

function formatCurrency(value) {
    return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displaySuccessResult(result, amount) {
    document.getElementById('resChurch').textContent =
        result.churchName || churchSelect.options[churchSelect.selectedIndex].text;
    document.getElementById('resReference').textContent =
        result.referenceName || referenceSelect.options[referenceSelect.selectedIndex].text;
    document.getElementById('resAmount').textContent = formatCurrency(result.amount ?? amount);

    form.classList.add('hidden');
    document.querySelector('.header').classList.add('hidden');
    successArea.classList.remove('hidden');
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

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="material-icons">hourglass_top</span> Processando...';

    const payload = {
        churchId,
        reference,
        amount,
    };

    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/api/repasses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const message =
                errorData?.resultMessage ||
                errorData?.title ||
                `Erro ${response.status}: não foi possível registrar o repass.`;
            throw new Error(message);
        }

        const result = await response.json();
        displaySuccessResult(result, amount);
    } catch (error) {
        console.error('Erro ao registrar repass:', error);
        showError(error.message || 'Ocorreu um erro inesperado. Tente novamente.');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span class="material-icons">done_all</span> Registrar Repass';
    }
});

btnNew.addEventListener('click', () => {
    form.reset();
    hideError();
    successArea.classList.add('hidden');
    form.classList.remove('hidden');
    document.querySelector('.header').classList.remove('hidden');
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span class="material-icons">done_all</span> Registrar Repass';
});

loadChurches();
loadReferences();
