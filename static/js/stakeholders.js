// Portal de Stakeholders & Pagos a Proveedores (ERP GDS)

let currentMonth = '';
let arcaData = [];
let arcaSortKey = 'fecha_emision';
let arcaSortDesc = true;

const METODOS_PAGO = [
    { key: 'Efectivo', label: '🟩 Efectivo', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
    { key: 'Galicia', label: '🟧 Galicia', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    { key: 'Mercado Pago', label: '🟦 Mercado Pago', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    { key: 'Tarjeta crédito', label: '🟪 Tarjeta crédito', bg: '#faf5ff', color: '#6d28d9', border: '#e9d5ff' }
];

function formatCurrency(num) {
    if (num === null || num === undefined || isNaN(num)) return '$ 0';
    return '$ ' + Math.round(Number(num)).toLocaleString('es-AR');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showToast(message, type = 'info') {
    const existing = document.getElementById('stakeholder-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'stakeholder-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '10px';
    toast.style.fontWeight = '700';
    toast.style.fontSize = '0.9rem';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
    toast.style.zIndex = '10000';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.style.transition = 'all 0.3s ease';

    if (type === 'success') {
        toast.style.background = '#059669';
        toast.style.color = '#ffffff';
        toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${escapeHtml(message)}`;
    } else if (type === 'error') {
        toast.style.background = '#dc2626';
        toast.style.color = '#ffffff';
        toast.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(message)}`;
    } else {
        toast.style.background = '#1e293b';
        toast.style.color = '#ffffff';
        toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${escapeHtml(message)}`;
    }

    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==========================================
// AUTENTICACIÓN
// ==========================================

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/check');
        const data = await res.json();
        const modal = document.getElementById('auth-modal');
        if (!data.authenticated) {
            modal.style.display = 'flex';
        } else {
            modal.style.display = 'none';
            initPortal();
        }
    } catch (e) {
        console.error("Error checkAuth:", e);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const pin = document.getElementById('input-pin').value;
    const errDiv = document.getElementById('login-error');
    const btn = document.getElementById('btn-submit-pin');
    
    errDiv.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verificando...`;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: pin })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('auth-modal').style.display = 'none';
            initPortal();
        } else {
            errDiv.textContent = data.message || "PIN inválido";
            errDiv.style.display = 'block';
        }
    } catch (ex) {
        errDiv.textContent = "Error de conexión al autenticar";
        errDiv.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> Ingresar al Portal`;
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        location.reload();
    } catch (e) {
        location.reload();
    }
}

// ==========================================
// INICIALIZACIÓN DEL PORTAL
// ==========================================

async function initPortal() {
    await loadMonths();
    await fetchAllData();
    pollSyncStatus();
    setInterval(pollSyncStatus, 15000);
}

async function loadMonths() {
    try {
        const res = await fetch('/api/meses_disponibles');
        const data = await res.json();
        const select = document.getElementById('select-global-mes');
        select.innerHTML = '<option value="all">Todos los meses</option>';

        const mesesNombres = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        data.meses.forEach(m => {
            const parts = m.split('-');
            const label = parts.length === 2 ? `${mesesNombres[parseInt(parts[1]) - 1]} ${parts[0]}` : m;
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = label;
            select.appendChild(opt);
        });

        currentMonth = data.mes_actual || '';
        select.value = currentMonth;
    } catch (e) {
        console.error("Error al cargar meses:", e);
    }
}

function onMonthChange(val) {
    currentMonth = val;
    fetchAllData();
}

async function fetchAllData() {
    await Promise.all([
        fetchArcaComprasCloud(),
        fetchCuentasPagarCloud()
    ]);
}

// ==========================================
// TAB 1: COMPRAS ARCA
// ==========================================

async function fetchArcaComprasCloud() {
    try {
        const param = currentMonth && currentMonth !== 'all' ? '?mes=' + currentMonth : '';
        const res = await fetch('/api/arca_compras' + param);
        const data = await res.json();

        arcaData = data.compras || [];

        // Actualizar KPIs
        const resStats = data.resumen || {};
        document.getElementById('kpi-total-facturado').textContent = formatCurrency(resStats.total_importe || 0);
        document.getElementById('kpi-count-facturas').textContent = `${resStats.total_compras || 0} comprobantes emitidos`;

        const pendienteImp = (resStats.total_importe || 0) - (resStats.pagados_total || 0);
        document.getElementById('kpi-total-pendiente').textContent = formatCurrency(pendienteImp > 0 ? pendienteImp : 0);
        document.getElementById('kpi-count-pendientes').textContent = `${resStats.pendientes || 0} facturas por pagar`;

        document.getElementById('kpi-total-pagado').textContent = formatCurrency(resStats.pagados_total || 0);
        document.getElementById('kpi-count-pagados').textContent = `${resStats.pagados || 0} facturas abonadas`;

        document.getElementById('kpi-count-nc-retro').textContent = `${resStats.notas_credito || 0} NC / ${resStats.retroactivas || 0} Retros`;

        // Actualizar valores de desglose de métodos
        const mObj = resStats.pagos_por_metodo || {};
        document.getElementById('metodo-val-galicia').textContent = formatCurrency(mObj['Galicia'] || 0);
        document.getElementById('metodo-val-mp').textContent = formatCurrency(mObj['Mercado Pago'] || 0);
        document.getElementById('metodo-val-efectivo').textContent = formatCurrency(mObj['Efectivo'] || 0);
        document.getElementById('metodo-val-tarjeta').textContent = formatCurrency(mObj['Tarjeta crédito'] || 0);

        renderArcaCloudTable();
    } catch (e) {
        console.error("Error cargando compras ARCA:", e);
    }
}

function checkIsNC(c) {
    if (!c) return false;
    if (c.is_nc) return true;
    const t = String(c.tipo_comprobante || '').trim().toLowerCase();
    const codes = ['3', '8', '13', '15', '53', '03', '08', '003', '008', '013', '053'];
    return codes.includes(t) || (t.includes('nota') && (t.includes('cr') || t.includes('credito'))) || t === 'nc';
}

function sortArcaCloud(key) {
    if (arcaSortKey === key) {
        arcaSortDesc = !arcaSortDesc;
    } else {
        arcaSortKey = key;
        arcaSortDesc = true;
    }
    renderArcaCloudTable();
}

function renderArcaCloudTable() {
    const tbody = document.getElementById('tbl-arca-cloud-body');
    if (!tbody) return;

    const filterVal = document.getElementById('arca-cloud-filter').value;
    let filtered = [...arcaData];

    if (filterVal === 'recibida') filtered = filtered.filter(c => c.factura_recibida);
    if (filterVal === 'no_recibida') filtered = filtered.filter(c => !c.factura_recibida);
    if (filterVal === 'pendiente') filtered = filtered.filter(c => c.estado !== 'Pagado');
    if (filterVal === 'pagado') filtered = filtered.filter(c => c.estado === 'Pagado');
    if (filterVal === 'nc') filtered = filtered.filter(c => checkIsNC(c));
    if (filterVal === 'retroactiva') filtered = filtered.filter(c => c.es_retroactiva == 1);

    if (arcaSortKey) {
        filtered.sort((a, b) => {
            let valA = a[arcaSortKey];
            let valB = b[arcaSortKey];
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            if (valA < valB) return arcaSortDesc ? 1 : -1;
            if (valA > valB) return arcaSortDesc ? -1 : 1;
            return 0;
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: #64748b; padding: 2rem;">
            No hay compras registradas para este filtro o período.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const esNC = checkIsNC(c);
        const esRetro = c.es_retroactiva == 1;

        const ncTag = esNC ? ` <span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 700; font-size: 0.68rem; padding: 2px 5px;"><i class="fa-solid fa-file-invoice-dollar"></i> NC</span>` : '';
        const retroTag = esRetro ? ` <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 700; font-size: 0.68rem; padding: 2px 5px;"><i class="fa-solid fa-clock-rotate-left"></i> Retro</span>` : '';

        const recibida = c.factura_recibida
            ? `<span title="Factura física recibida" style="color: #059669; font-size: 1.1rem;"><i class="fa-solid fa-circle-check"></i></span>`
            : `<button class="btn btn-sm" style="font-size: 0.72rem; padding: 2px 7px; background: #f1f5f9; border: 1px solid #cbd5e1;" onclick="marcarRecibidaCloud(${c.id})" title="Marcar recibida"><i class="fa-solid fa-qrcode"></i> Recibir</button>`;

        const estadoBadge = c.estado === 'Pagado'
            ? `<span style="color: #059669; font-weight: 700; font-size: 0.8rem;"><i class="fa-solid fa-check"></i> Pagado</span>`
            : `<span style="color: #d97706; font-weight: 600; font-size: 0.8rem;"><i class="fa-solid fa-clock"></i> Pendiente</span>`;

        let metodoColContent = '';
        if (c.estado !== 'Pagado') {
            metodoColContent = `
                <select class="form-control" style="font-size: 0.78rem; padding: 3px 6px; height: 30px; border-radius: 8px; font-weight: 600; cursor: pointer; background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; width: 160px; display: inline-block;"
                    onchange="if(this.value) pagarArcaCloud(${c.id}, this.value)">
                    <option value="" disabled selected style="color: #64748b;">Pagar con...</option>
                    <option value="Efectivo" style="color: #059669; font-weight: 700; background: #ecfdf5;">🟩 Efectivo</option>
                    <option value="Galicia" style="color: #ea580c; font-weight: 700; background: #fff7ed;">🟧 Galicia</option>
                    <option value="Mercado Pago" style="color: #2563eb; font-weight: 700; background: #eff6ff;">🟦 Mercado Pago</option>
                    <option value="Tarjeta crédito" style="color: #7c3aed; font-weight: 700; background: #faf5ff;">🟪 Tarjeta crédito</option>
                </select>
            `;
        } else {
            let mObj = METODOS_PAGO.find(m => m.key.toLowerCase() === (c.metodo_pago || '').toLowerCase());
            if (!mObj) {
                if (c.metodo_pago === 'Efectivo' || c.metodo_pago === 'M1') mObj = METODOS_PAGO[0];
                else if (c.metodo_pago === 'Galicia') mObj = METODOS_PAGO[1];
                else if (c.metodo_pago === 'Mercado Pago' || c.metodo_pago === 'M2') mObj = METODOS_PAGO[2];
                else mObj = METODOS_PAGO[3];
            }

            metodoColContent = `
                <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <span class="badge" style="background: ${mObj.bg}; color: ${mObj.color}; border: 1px solid ${mObj.border}; font-weight: 700; font-size: 0.78rem; padding: 4px 10px; border-radius: 8px;">
                        ${escapeHtml(mObj.label)}
                    </span>
                    <button class="btn btn-sm" style="font-size: 0.72rem; padding: 3px 7px; background: #f8fafc; border: 1px solid #cbd5e1;" onclick="despagarArcaCloud(${c.id})" title="Deshacer Pago">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                </div>
            `;
        }

        const denom = escapeHtml(c.denominacion_emisor || '-');
        const rowBg = esNC ? 'background: rgba(239, 68, 68, 0.04);' : (c.estado === 'Pagado' ? 'background: rgba(5, 150, 105, 0.03);' : '');

        return `
            <tr style="${rowBg}">
                <td style="font-family: monospace; font-size: 0.82rem;">${escapeHtml(c.fecha_emision || '-')}${retroTag}</td>
                <td title="${denom}"><strong>${denom}</strong>${ncTag}</td>
                <td style="text-align: right; color: ${esNC ? '#dc2626' : '#d97706'}; font-weight: 600;">${formatCurrency(c.total_iva)}</td>
                <td style="text-align: right; font-weight: 800; font-size: 0.9rem; color: ${esNC ? '#dc2626' : '#0f172a'};">${formatCurrency(c.imp_total)}</td>
                <td style="text-align: center;">${recibida}</td>
                <td style="text-align: center;">${estadoBadge}</td>
                <td style="text-align: center; white-space: nowrap;">${metodoColContent}</td>
            </tr>
        `;
    }).join('');
}

async function pagarArcaCloud(id, metodo) {
    try {
        const res = await fetch(`/api/arca_compras/${id}/marcar_pago`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metodo_pago: metodo })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Pago registrado con ${metodo}`, 'success');
            fetchArcaComprasCloud();
        }
    } catch (e) {
        showToast('Error al registrar pago', 'error');
    }
}

async function despagarArcaCloud(id) {
    try {
        await fetch(`/api/arca_compras/${id}/desmarcar_pago`, { method: 'POST' });
        showToast('Pago desmarcado', 'info');
        fetchArcaComprasCloud();
    } catch (e) {
        showToast('Error al desmarcar pago', 'error');
    }
}

async function marcarRecibidaCloud(id) {
    try {
        await fetch(`/api/arca_compras/${id}/marcar_recibida`, { method: 'POST' });
        showToast('Factura marcada como recibida', 'success');
        fetchArcaComprasCloud();
    } catch (e) {
        showToast('Error al marcar recibida', 'error');
    }
}

async function handleMarcarMesPagadoCloud(cbx) {
    if (!cbx.checked) return;
    const targetMonth = currentMonth && currentMonth !== 'all' ? currentMonth : '';
    if (!targetMonth) {
        showToast('Seleccione un mes específico para pagar el lote completo', 'error');
        cbx.checked = false;
        return;
    }

    if (!confirm(`¿Confirma marcar como PAGADAS todas las compras de ${targetMonth} con Banco Galicia?`)) {
        cbx.checked = false;
        return;
    }

    try {
        const res = await fetch('/api/test/marcar_mes_pagado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mes: targetMonth })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Mes marcado como pagado', 'success');
            fetchArcaComprasCloud();
        }
    } catch (e) {
        showToast('Error al marcar mes pagado', 'error');
    } finally {
        cbx.checked = false;
    }
}

// ==========================================
// EXCEL EXPORT & IMPORT CLOUD
// ==========================================

function exportarArcaExcelCloud() {
    const mesParam = currentMonth ? '?mes=' + encodeURIComponent(currentMonth) : '';
    showToast('Generando archivo Excel...', 'info');
    window.location.href = '/api/arca_compras/export_excel' + mesParam;
}

function triggerImportArcaExcelCloud() {
    const input = document.getElementById('input-import-excel-cloud');
    if (input) {
        input.value = '';
        input.click();
    }
}

async function handleImportArcaExcelCloud(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    showToast('Subiendo e importando Excel...', 'info');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/arca_compras/import_excel', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Excel importado exitosamente', 'success');
            fetchArcaComprasCloud();
            fetchCuentasPagarCloud();
        } else {
            showToast('Error al importar Excel: ' + (data.message || 'Desconocido'), 'error');
        }
    } catch (e) {
        showToast('Error de conexión al importar Excel', 'error');
    } finally {
        event.target.value = '';
    }
}

// ==========================================
// TAB 2: CUENTAS POR PAGAR
// ==========================================

async function fetchCuentasPagarCloud() {
    try {
        const param = currentMonth && currentMonth !== 'all' ? '?mes=' + currentMonth : '';
        const res = await fetch('/api/cuentas_por_pagar' + param);
        const data = await res.json();

        const tbody = document.getElementById('tbl-cuentas-cloud-body');
        const rows = data.cuentas || [];

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #64748b; padding: 2rem;">No hay cuentas por pagar registradas</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const isPagado = r.estado === 'Pagado';
            const estadoBadge = isPagado
                ? `<span style="color: #059669; font-weight: 700;"><i class="fa-solid fa-check"></i> Pagado</span>`
                : `<span style="color: #d97706; font-weight: 600;"><i class="fa-solid fa-clock"></i> Pendiente</span>`;

            const actionBtn = isPagado
                ? `<span style="color: #64748b; font-size: 0.8rem;">${escapeHtml(r.medio_pago || 'Abonado')}</span>`
                : `<button class="btn btn-sm" style="background: var(--primary-accent); color: #ffffff; border: none; font-weight: 700; border-radius: 6px; padding: 3px 10px;" onclick="openModalPagarCuenta(${r.id}, '${escapeHtml(r.proveedor_nombre)}', ${r.monto_total})"><i class="fa-solid fa-dollar-sign"></i> Pagar</button>`;

            return `
                <tr>
                    <td style="font-family: monospace; font-size: 0.82rem;">${escapeHtml(r.fecha || '-')}</td>
                    <td><strong>${escapeHtml(r.proveedor_nombre || '-')}</strong></td>
                    <td><small style="color: #64748b;">${escapeHtml(r.factura_numero || '-')}</small></td>
                    <td style="text-align: right; font-weight: 800;">${formatCurrency(r.monto_total)}</td>
                    <td style="text-align: center;">${estadoBadge}</td>
                    <td style="text-align: center;">${actionBtn}</td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Error cargando cuentas por pagar:", e);
    }
}

function openModalPagarCuenta(id, prov, monto) {
    document.getElementById('modal-cuenta-id').value = id;
    document.getElementById('modal-cuenta-prov').textContent = `Proveedor: ${prov}`;
    document.getElementById('modal-cuenta-monto').textContent = `Monto a Pagar: ${formatCurrency(monto)}`;
    document.getElementById('modal-cuenta-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-pagar-cuenta').style.display = 'flex';
}

function closeModalPagarCuenta() {
    document.getElementById('modal-pagar-cuenta').style.display = 'none';
}

async function handleConfirmarPagoCuenta(e) {
    e.preventDefault();
    const id = document.getElementById('modal-cuenta-id').value;
    const metodo = document.getElementById('modal-cuenta-metodo').value;
    const fecha = document.getElementById('modal-cuenta-fecha').value;

    try {
        const res = await fetch('/api/cuentas_por_pagar/registrar_pago', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, medio_pago: metodo, fecha_pago: fecha })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Pago registrado correctamente', 'success');
            closeModalPagarCuenta();
            fetchAllData();
        }
    } catch (ex) {
        showToast('Error al registrar pago', 'error');
    }
}

// ==========================================
// TABS & UI HELPERS
// ==========================================

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabId).style.display = 'block';
    if (tabId === 'tab-arca') document.getElementById('btn-tab-arca').classList.add('active');
    if (tabId === 'tab-cuentas') document.getElementById('btn-tab-cuentas').classList.add('active');
    if (tabId === 'tab-metodos') document.getElementById('btn-tab-metodos').classList.add('active');
}

async function triggerManualSync() {
    const badge = document.getElementById('cloud-sync-badge');
    const text = document.getElementById('cloud-sync-text');
    badge.classList.add('syncing');
    text.textContent = 'Sincronizando...';

    try {
        const res = await fetch('/api/firebase/sync_now', { method: 'POST' });
        const data = await res.json();
        showToast('Nube sincronizada con éxito', 'success');
        fetchAllData();
    } catch (e) {
        showToast('Error forzando sincronización', 'error');
    } finally {
        pollSyncStatus();
    }
}

async function pollSyncStatus() {
    try {
        const res = await fetch('/api/firebase/status');
        const data = await res.json();
        const badge = document.getElementById('cloud-sync-badge');
        const text = document.getElementById('cloud-sync-text');

        badge.classList.remove('syncing');
        if (data.enabled || data.mode === 'ONLINE_SYNC') {
            badge.style.background = 'rgba(16, 185, 129, 0.12)';
            badge.style.color = '#059669';
            text.textContent = `Nube Conectada (${data.synced_count} reg)`;
        } else {
            badge.style.background = 'rgba(245, 158, 11, 0.12)';
            badge.style.color = '#d97706';
            text.textContent = data.message || 'Modo Local';
        }
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});
