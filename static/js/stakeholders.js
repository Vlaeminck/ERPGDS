// Portal de Stakeholders & Pagos a Proveedores (ERP GDS)

let currentMonth = '';
let arcaData = [];
let aliasMap = {};
let allProveedoresList = [];
let arcaSortKey = 'fecha_emision';
let arcaSortDesc = true;

// Instancias de Chart.js
let chartEvolucion = null;
let chartCategoria = null;
let chartMetodo = null;
let chartTop = null;
let chartRubro = null;

// Categorías y Subcategorías
let categoriesTree = [];
let categoriesFlat = [];

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

function truncateText(str, maxLen = 30) {
    if (!str) return '';
    const s = String(str).trim();
    if (s.length <= maxLen) return s;
    return s.substring(0, maxLen - 3) + '...';
}

function formatSupplierCell(razonSocial) {
    const raw = String(razonSocial || '-').trim();
    const alias = aliasMap[raw] || aliasMap[raw.toUpperCase()] || aliasMap[raw.toLowerCase()] || '';

    if (alias) {
        const truncAlias = truncateText(alias, 30);
        return `
            <div class="supplier-name-cell" title="Razón Social: ${escapeHtml(raw)}&#10;Nombre de Fantasía: ${escapeHtml(alias)}">
                <strong style="color: #0f172a;">${escapeHtml(truncAlias)}</strong>
                <div style="font-size: 0.73rem; color: #64748b; font-weight: 500;">${escapeHtml(truncateText(raw, 24))}</div>
            </div>
        `;
    } else {
        const truncRaw = truncateText(raw, 30);
        return `
            <div class="supplier-name-cell" title="${escapeHtml(raw)}">
                <strong style="color: #0f172a;">${escapeHtml(truncRaw)}</strong>
            </div>
        `;
    }
}

function getCategoryBadge(cat) {
    if (!cat) return `<span style="color: #94a3b8; font-size: 0.72rem;">-</span>`;
    const c = String(cat).trim();
    if (c === 'Pinamar') return `<span class="badge-cat badge-cat-pinamar"><i class="fa-solid fa-umbrella-beach"></i> Pinamar</span>`;
    if (c === 'Leloir') return `<span class="badge-cat badge-cat-leloir"><i class="fa-solid fa-tree"></i> Leloir</span>`;
    if (c === 'Socios') return `<span class="badge-cat badge-cat-socios"><i class="fa-solid fa-handshake"></i> Socios</span>`;
    return `<span class="badge-cat" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">${escapeHtml(c)}</span>`;
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
    await loadCategories();
    await fetchAllData();
    await loadProveedoresAlias();
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
        fetchCuentasPagarCloud(),
        fetchDashboardStats()
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
        aliasMap = data.alias_map || aliasMap || {};

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

        // Actualizar valores de desglose de categorías
        const cObj = resStats.pagos_por_categoria || {};
        const elPin = document.getElementById('cat-val-pinamar');
        const elLel = document.getElementById('cat-val-leloir');
        const elSoc = document.getElementById('cat-val-socios');
        if (elPin) elPin.textContent = formatCurrency(cObj['Pinamar'] || 0);
        if (elLel) elLel.textContent = formatCurrency(cObj['Leloir'] || 0);
        if (elSoc) elSoc.textContent = formatCurrency(cObj['Socios'] || 0);

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
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: #64748b; padding: 2rem;">
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
            : `<button class="btn btn-sm" style="font-size: 0.72rem; padding: 2px 7px; background: #f1f5f9; border: 1px solid #cbd5e1; cursor: pointer;" onclick="marcarRecibidaCloud(${c.id})" title="Marcar recibida"><i class="fa-solid fa-qrcode"></i> Recibir</button>`;

        const estadoBadge = c.estado === 'Pagado'
            ? `<span style="color: #059669; font-weight: 700; font-size: 0.8rem;"><i class="fa-solid fa-check"></i> Pagado</span>`
            : `<span style="color: #d97706; font-weight: 600; font-size: 0.8rem;"><i class="fa-solid fa-clock"></i> Pendiente</span>`;

        let accionColContent = '';
        if (c.estado !== 'Pagado') {
            accionColContent = `
                <button class="btn btn-sm" style="background: var(--primary-accent); color: #ffffff; border: none; font-weight: 700; border-radius: 8px; padding: 4px 12px; font-size: 0.8rem; cursor: pointer;" onclick="openModalPagarArca(${c.id}, '${escapeHtml(c.denominacion_emisor || '')}', ${c.imp_total})">
                    <i class="fa-solid fa-dollar-sign"></i> Pagar...
                </button>
            `;
        } else {
            let mObj = METODOS_PAGO.find(m => m.key.toLowerCase() === (c.metodo_pago || '').toLowerCase());
            if (!mObj) {
                if (c.metodo_pago === 'Efectivo' || c.metodo_pago === 'M1') mObj = METODOS_PAGO[0];
                else if (c.metodo_pago === 'Galicia') mObj = METODOS_PAGO[1];
                else if (c.metodo_pago === 'Mercado Pago' || c.metodo_pago === 'M2') mObj = METODOS_PAGO[2];
                else mObj = METODOS_PAGO[3];
            }

            accionColContent = `
                <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <span class="badge" style="background: ${mObj.bg}; color: ${mObj.color}; border: 1px solid ${mObj.border}; font-weight: 700; font-size: 0.76rem; padding: 3px 8px; border-radius: 6px;">
                        ${escapeHtml(mObj.label)}
                    </span>
                    <button class="btn btn-sm" style="font-size: 0.72rem; padding: 3px 7px; background: #f8fafc; border: 1px solid #cbd5e1; cursor: pointer;" onclick="despagarArcaCloud(${c.id})" title="Deshacer Pago">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                </div>
            `;
        }

        const supplierHtml = formatSupplierCell(c.denominacion_emisor);
        const catBadge = getCategoryBadge(c.categoria_pago);
        const rowBg = esNC ? 'background: rgba(239, 68, 68, 0.04);' : (c.estado === 'Pagado' ? 'background: rgba(5, 150, 105, 0.03);' : '');

        return `
            <tr style="${rowBg}">
                <td style="font-family: monospace; font-size: 0.82rem;">${escapeHtml(c.fecha_emision || '-')}${retroTag}</td>
                <td>${supplierHtml}${ncTag}</td>
                <td style="text-align: right; color: ${esNC ? '#dc2626' : '#d97706'}; font-weight: 600;">${formatCurrency(c.total_iva)}</td>
                <td style="text-align: right; font-weight: 800; font-size: 0.9rem; color: ${esNC ? '#dc2626' : '#0f172a'};">${formatCurrency(c.imp_total)}</td>
                <td style="text-align: center;">${catBadge}</td>
                <td style="text-align: center;">${recibida}</td>
                <td style="text-align: center;">${estadoBadge}</td>
                <td style="text-align: center; white-space: nowrap;">${accionColContent}</td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// MODAL UNIVERSAL DE PAGO (CATEGORÍA OBLIGATORIA)
// ==========================================

function openModalPagarArca(id, denom, total) {
    document.getElementById('modal-pago-type').value = 'arca';
    document.getElementById('modal-pago-id').value = id;
    document.getElementById('modal-pago-title').textContent = 'Registrar Pago de Compra';
    document.getElementById('modal-pago-desc').textContent = `Proveedor: ${denom}`;
    document.getElementById('modal-pago-monto').textContent = `Monto a Pagar: ${formatCurrency(total)}`;
    document.getElementById('modal-pago-categoria').value = '';
    document.getElementById('modal-pago-metodo').value = 'Galicia';
    document.getElementById('modal-pago-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-pago-general').style.display = 'flex';
}

function openModalPagarMes() {
    const targetMonth = currentMonth && currentMonth !== 'all' ? currentMonth : '';
    if (!targetMonth) {
        showToast('Seleccione un mes específico en la barra superior para pagar el lote completo', 'error');
        return;
    }

    const pendientes = arcaData.filter(c => c.estado !== 'Pagado');
    const totalPendiente = pendientes.reduce((acc, c) => acc + (c.imp_total || 0), 0);

    if (pendientes.length === 0) {
        showToast('No hay compras pendientes para el mes seleccionado', 'info');
        return;
    }

    document.getElementById('modal-pago-type').value = 'arca_mes';
    document.getElementById('modal-pago-id').value = targetMonth;
    document.getElementById('modal-pago-title').textContent = `Pagar Mes Completo (${targetMonth})`;
    document.getElementById('modal-pago-desc').textContent = `Se marcarán como pagadas ${pendientes.length} facturas pendientes de ${targetMonth}`;
    document.getElementById('modal-pago-monto').textContent = `Total del Lote: ${formatCurrency(totalPendiente)}`;
    document.getElementById('modal-pago-categoria').value = '';
    document.getElementById('modal-pago-metodo').value = 'Galicia';
    document.getElementById('modal-pago-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-pago-general').style.display = 'flex';
}

function openModalPagarCuenta(id, prov, monto) {
    document.getElementById('modal-pago-type').value = 'cuenta';
    document.getElementById('modal-pago-id').value = id;
    document.getElementById('modal-pago-title').textContent = 'Pagar Cuenta Corriente';
    document.getElementById('modal-pago-desc').textContent = `Proveedor: ${prov}`;
    document.getElementById('modal-pago-monto').textContent = `Saldo a Abonar: ${formatCurrency(monto)}`;
    document.getElementById('modal-pago-categoria').value = '';
    document.getElementById('modal-pago-metodo').value = 'Galicia';
    document.getElementById('modal-pago-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('modal-pago-general').style.display = 'flex';
}

function closeModalPagoGeneral() {
    document.getElementById('modal-pago-general').style.display = 'none';
}

async function handleConfirmarPagoGeneral(e) {
    e.preventDefault();
    const tipo = document.getElementById('modal-pago-type').value;
    const id = document.getElementById('modal-pago-id').value;
    const categoria = document.getElementById('modal-pago-categoria').value;
    const metodo = document.getElementById('modal-pago-metodo').value;
    const fecha = document.getElementById('modal-pago-fecha').value;
    const btn = document.getElementById('btn-confirmar-pago-gen');

    if (!categoria) {
        showToast('Debe seleccionar obligatoriamente una Categoría para Pago (Pinamar, Leloir o Socios)', 'error');
        document.getElementById('modal-pago-categoria').focus();
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registrando...`;

    try {
        if (tipo === 'arca') {
            const res = await fetch(`/api/arca_compras/${id}/marcar_pago`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metodo_pago: metodo, categoria_pago: categoria, fecha_pago: fecha })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Pago registrado (${categoria} - ${metodo})`, 'success');
                closeModalPagoGeneral();
                fetchAllData();
            } else {
                showToast(data.message || 'Error al registrar pago', 'error');
            }
        } else if (tipo === 'arca_mes') {
            const res = await fetch('/api/test/marcar_mes_pagado', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mes: id, metodo_pago: metodo, categoria_pago: categoria })
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message || 'Mes completo pagado exitosamente', 'success');
                closeModalPagoGeneral();
                fetchAllData();
            } else {
                showToast(data.message || 'Error al pagar mes', 'error');
            }
        } else if (tipo === 'cuenta') {
            const res = await fetch('/api/cuentas_por_pagar/registrar_pago', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, medio_pago: metodo, categoria_pago: categoria, fecha_pago: fecha })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Cuenta pagada (${categoria} - ${metodo})`, 'success');
                closeModalPagoGeneral();
                fetchAllData();
            } else {
                showToast(data.error || 'Error al registrar pago', 'error');
            }
        }
    } catch (ex) {
        showToast('Error de conexión al registrar pago', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Confirmar y Registrar Pago`;
    }
}

async function despagarArcaCloud(id) {
    try {
        await fetch(`/api/arca_compras/${id}/desmarcar_pago`, { method: 'POST' });
        showToast('Pago desmarcado', 'info');
        fetchAllData();
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
            fetchAllData();
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
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: #64748b; padding: 2rem;">No hay cuentas por pagar registradas</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const isPagado = r.estado === 'Pagado';
            const estadoBadge = isPagado
                ? `<span style="color: #059669; font-weight: 700;"><i class="fa-solid fa-check"></i> Pagado</span>`
                : `<span style="color: #d97706; font-weight: 600;"><i class="fa-solid fa-clock"></i> Pendiente</span>`;

            const actionBtn = isPagado
                ? `<span style="color: #64748b; font-size: 0.8rem;">${escapeHtml(r.medio_pago || 'Abonado')}</span>`
                : `<button class="btn btn-sm" style="background: var(--primary-accent); color: #ffffff; border: none; font-weight: 700; border-radius: 6px; padding: 3px 10px; cursor: pointer;" onclick="openModalPagarCuenta(${r.id}, '${escapeHtml(r.proveedor_nombre || '')}', ${r.monto_total})"><i class="fa-solid fa-dollar-sign"></i> Pagar...</button>`;

            const supplierHtml = formatSupplierCell(r.proveedor_nombre);
            const catBadge = getCategoryBadge(r.categoria_pago);

            return `
                <tr>
                    <td style="font-family: monospace; font-size: 0.82rem;">${escapeHtml(r.fecha || '-')}</td>
                    <td>${supplierHtml}</td>
                    <td><small style="color: #64748b;">${escapeHtml(r.factura_numero || '-')}</small></td>
                    <td style="text-align: right; font-weight: 800;">${formatCurrency(r.monto_total)}</td>
                    <td style="text-align: center;">${catBadge}</td>
                    <td style="text-align: center;">${estadoBadge}</td>
                    <td style="text-align: center;">${actionBtn}</td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Error cargando cuentas por pagar:", e);
    }
}

// ==========================================
// TAB 4: DASHBOARD DE GRÁFICOS & RANKING (CHART.JS)
// ==========================================

let dashboardRawData = null;
let currentRankingList = [];
let dashboardRubroViewMode = 'categoria'; // 'categoria' | 'subcategoria'

function populateDashboardFilterCategories() {
    const catSelect = document.getElementById('dash-filter-cat');
    if (!catSelect) return;

    const currentVal = catSelect.value || 'all';
    let optionsHtml = '<option value="all">-- Todos los Rubros --</option>';

    const seenCats = new Set();
    // 1. Agregar desde categoriesTree
    (categoriesTree || []).forEach(cat => {
        const nom = (cat.nombre || '').trim();
        if (nom && !seenCats.has(nom.toLowerCase())) {
            seenCats.add(nom.toLowerCase());
            const isSel = (nom.toLowerCase() === currentVal.toLowerCase()) ? 'selected' : '';
            optionsHtml += `<option value="${escapeHtml(nom)}" ${isSel}>${escapeHtml(nom)}</option>`;
        }
    });

    // 2. Agregar desde categorías presentes en los datos de proveedores
    if (dashboardRawData && dashboardRawData.gastos_rubro) {
        Object.keys(dashboardRawData.gastos_rubro).forEach(nom => {
            const trimmed = nom.trim();
            if (trimmed && !seenCats.has(trimmed.toLowerCase())) {
                seenCats.add(trimmed.toLowerCase());
                const isSel = (trimmed.toLowerCase() === currentVal.toLowerCase()) ? 'selected' : '';
                optionsHtml += `<option value="${escapeHtml(trimmed)}" ${isSel}>${escapeHtml(trimmed)}</option>`;
            }
        });
    }

    catSelect.innerHTML = optionsHtml;
}

function onDashboardCategoryChange() {
    const catSelect = document.getElementById('dash-filter-cat');
    const subcatSelect = document.getElementById('dash-filter-subcat');
    const selectedCat = catSelect ? catSelect.value : 'all';

    if (subcatSelect) {
        let subHtml = '<option value="all">-- Todas las Subcategorías --</option>';
        if (selectedCat && selectedCat !== 'all') {
            const matchedCat = (categoriesTree || []).find(c => (c.nombre || '').toLowerCase().trim() === selectedCat.toLowerCase().trim());
            if (matchedCat && matchedCat.subcategorias) {
                matchedCat.subcategorias.forEach(sub => {
                    subHtml += `<option value="${escapeHtml(sub.nombre)}">${escapeHtml(sub.nombre)}</option>`;
                });
            }
        }
        subcatSelect.innerHTML = subHtml;
    }

    fetchDashboardStats();
}

function resetDashboardFilters() {
    const catSelect = document.getElementById('dash-filter-cat');
    const subcatSelect = document.getElementById('dash-filter-subcat');
    const metodoSelect = document.getElementById('dash-filter-metodo');
    const estadoSelect = document.getElementById('dash-filter-estado');
    const searchInput = document.getElementById('input-search-ranking');

    if (catSelect) catSelect.value = 'all';
    if (subcatSelect) subcatSelect.innerHTML = '<option value="all">-- Todas las Subcategorías --</option>';
    if (metodoSelect) metodoSelect.value = 'all';
    if (estadoSelect) estadoSelect.value = 'all';
    if (searchInput) searchInput.value = '';

    fetchDashboardStats();
}

function setRubroViewMode(mode) {
    dashboardRubroViewMode = mode;
    const btnCat = document.getElementById('btn-view-rubro-cat');
    const btnSub = document.getElementById('btn-view-rubro-sub');
    const titleEl = document.getElementById('title-chart-rubro');

    if (mode === 'categoria') {
        if (btnCat) {
            btnCat.style.background = 'var(--primary-accent)';
            btnCat.style.color = '#ffffff';
            btnCat.style.border = 'none';
        }
        if (btnSub) {
            btnSub.style.background = '#f1f5f9';
            btnSub.style.color = '#475569';
            btnSub.style.border = '1px solid #cbd5e1';
        }
        if (titleEl) titleEl.textContent = 'Gastos por Rubro Principal';
    } else {
        if (btnSub) {
            btnSub.style.background = 'var(--primary-accent)';
            btnSub.style.color = '#ffffff';
            btnSub.style.border = 'none';
        }
        if (btnCat) {
            btnCat.style.background = '#f1f5f9';
            btnCat.style.color = '#475569';
            btnCat.style.border = '1px solid #cbd5e1';
        }
        if (titleEl) titleEl.textContent = 'Gastos por Subcategoría';
    }

    if (dashboardRawData) {
        renderRubroChart(dashboardRawData);
    }
}

async function fetchDashboardStats() {
    try {
        const catVal = document.getElementById('dash-filter-cat')?.value || 'all';
        const subcatVal = document.getElementById('dash-filter-subcat')?.value || 'all';
        const metodoVal = document.getElementById('dash-filter-metodo')?.value || 'all';
        const estadoVal = document.getElementById('dash-filter-estado')?.value || 'all';

        const params = new URLSearchParams();
        if (currentMonth && currentMonth !== 'all') params.append('mes', currentMonth);
        if (catVal && catVal !== 'all') params.append('categoria', catVal);
        if (subcatVal && subcatVal !== 'all') params.append('subcategoria', subcatVal);
        if (metodoVal && metodoVal !== 'all') params.append('metodo_pago', metodoVal);
        if (estadoVal && estadoVal !== 'all') params.append('estado', estadoVal);

        const url = '/api/dashboard/stats?' + params.toString();
        const res = await fetch(url);
        const data = await res.json();
        dashboardRawData = data;
        currentRankingList = data.ranking_proveedores || [];

        // Actualizar mini KPIs
        const resumen = data.resumen || {};
        const kpiTot = document.getElementById('dash-kpi-total');
        const kpiPag = document.getElementById('dash-kpi-pagado');
        const kpiPen = document.getElementById('dash-kpi-pendiente');
        const kpiComp = document.getElementById('dash-kpi-comprobantes');
        const kpiProv = document.getElementById('dash-kpi-proveedores');

        if (kpiTot) kpiTot.textContent = formatCurrency(resumen.total_facturado);
        if (kpiPag) kpiPag.textContent = formatCurrency(resumen.total_pagado);
        if (kpiPen) kpiPen.textContent = formatCurrency(resumen.total_pendiente);
        if (kpiComp) kpiComp.textContent = (resumen.total_comprobantes || 0).toLocaleString('es-AR');
        if (kpiProv) kpiProv.textContent = (resumen.total_proveedores || 0).toLocaleString('es-AR');

        // Poblar selector de categorías si no está cargado
        populateDashboardFilterCategories();

        renderDashboardCharts(data);
        renderRankingTable();
    } catch (e) {
        console.error("Error cargando estadísticas del dashboard:", e);
    }
}

function renderDashboardCharts(data) {
    if (typeof Chart === 'undefined') return;

    // 1. Gráfico de Evolución Mensual
    const ctxEvolucion = document.getElementById('chart-evolucion');
    if (ctxEvolucion) {
        if (chartEvolucion) chartEvolucion.destroy();
        const evData = data.evolucion_mensual || { meses: [], facturado: [], pagado: [] };
        
        chartEvolucion = new Chart(ctxEvolucion, {
            type: 'bar',
            data: {
                labels: evData.meses || [],
                datasets: [
                    {
                        label: 'Total Facturado',
                        data: evData.facturado || [],
                        backgroundColor: 'rgba(37, 99, 235, 0.7)',
                        borderColor: '#2563eb',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Total Pagado',
                        data: evData.pagado || [],
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: '#10b981',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { font: { weight: 'bold', family: 'Albert Sans' } } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + formatCurrency(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: val => '$ ' + (val >= 1000000 ? (val/1000000).toFixed(1) + 'M' : (val >= 1000 ? (val/1000).toFixed(0) + 'k' : val))
                        },
                        grid: { color: 'rgba(226, 232, 240, 0.6)' }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // 2. Gráfico por Categoría de Pago (Pinamar, Leloir, Socios)
    const ctxCategoria = document.getElementById('chart-categoria');
    if (ctxCategoria) {
        if (chartCategoria) chartCategoria.destroy();
        const catObj = data.gastos_categoria || {};
        const catLabels = Object.keys(catObj);
        const catValues = Object.values(catObj);

        chartCategoria = new Chart(ctxCategoria, {
            type: 'doughnut',
            data: {
                labels: catLabels.length ? catLabels : ['Sin Datos'],
                datasets: [{
                    data: catValues.length ? catValues : [0],
                    backgroundColor: ['#0284c7', '#16a34a', '#d97706', '#94a3b8'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { weight: 'bold', family: 'Albert Sans' } } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + formatCurrency(context.raw);
                            }
                        }
                    }
                }
            }
        });
    }

    // 3. Gráfico por Método de Pago
    const ctxMetodo = document.getElementById('chart-metodo');
    if (ctxMetodo) {
        if (chartMetodo) chartMetodo.destroy();
        const metObj = data.gastos_metodo || {};
        const metLabels = Object.keys(metObj);
        const metValues = Object.values(metObj);

        chartMetodo = new Chart(ctxMetodo, {
            type: 'doughnut',
            data: {
                labels: metLabels.length ? metLabels : ['Sin Pagos'],
                datasets: [{
                    data: metValues.length ? metValues : [0],
                    backgroundColor: ['#059669', '#ea580c', '#2563eb', '#7c3aed', '#64748b'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { weight: 'bold', family: 'Albert Sans' } } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + formatCurrency(context.raw);
                            }
                        }
                    }
                }
            }
        });
    }

    // 4. Gráfico Top Proveedores (del Filtro Actual)
    const ctxTop = document.getElementById('chart-top-proveedores');
    if (ctxTop) {
        if (chartTop) chartTop.destroy();
        const topList = data.top_proveedores || [];
        const topLabels = topList.map(t => t.display_name);
        const topValues = topList.map(t => t.total);

        const filterCat = document.getElementById('dash-filter-cat')?.value || 'all';
        const titleTopEl = document.getElementById('title-top-proveedores');
        const subTopEl = document.getElementById('sub-top-proveedores');
        if (titleTopEl) {
            titleTopEl.textContent = (filterCat && filterCat !== 'all') ? `Top Proveedores (${filterCat})` : 'Top Proveedores';
        }
        if (subTopEl) {
            subTopEl.textContent = (filterCat && filterCat !== 'all') ? `Proveedores con mayor facturación en ${filterCat}` : 'Mayores importes facturados';
        }

        chartTop = new Chart(ctxTop, {
            type: 'bar',
            data: {
                labels: topLabels.length ? topLabels : ['Sin Proveedores'],
                datasets: [{
                    label: 'Gasto Total',
                    data: topValues.length ? topValues : [0],
                    backgroundColor: 'rgba(124, 58, 237, 0.75)',
                    borderColor: '#7c3aed',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: function(items) {
                                const idx = items[0].dataIndex;
                                return topList[idx] ? topList[idx].razon_social : '';
                            },
                            label: function(context) {
                                return 'Importe: ' + formatCurrency(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            callback: val => '$ ' + (val >= 1000000 ? (val/1000000).toFixed(1) + 'M' : (val >= 1000 ? (val/1000).toFixed(0) + 'k' : val))
                        },
                        grid: { color: 'rgba(226, 232, 240, 0.6)' }
                    },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    // 5. Gráfico por Rubro / Subcategoría
    renderRubroChart(data);
}

function renderRubroChart(data) {
    const ctxRubro = document.getElementById('chart-rubro');
    if (!ctxRubro || typeof Chart === 'undefined') return;
    if (chartRubro) chartRubro.destroy();

    const isSub = (dashboardRubroViewMode === 'subcategoria');
    const rubroObj = isSub ? (data.gastos_subrubro || {}) : (data.gastos_rubro || {});
    const rubroLabels = Object.keys(rubroObj);
    const rubroValues = Object.values(rubroObj);

    const palette = [
        '#e11d48', '#059669', '#2563eb', '#d97706',
        '#7c3aed', '#0891b2', '#ea580c', '#4b5563',
        '#84cc16', '#ec4899', '#6366f1', '#14b8a6',
        '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'
    ];

    chartRubro = new Chart(ctxRubro, {
        type: 'doughnut',
        data: {
            labels: rubroLabels.length ? rubroLabels : ['Sin Datos'],
            datasets: [{
                data: rubroValues.length ? rubroValues : [0],
                backgroundColor: palette.slice(0, Math.max(rubroLabels.length, 1)),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedLabel = rubroLabels[idx];
                    if (!clickedLabel || clickedLabel === 'Sin Datos') return;

                    if (isSub && clickedLabel.includes('>')) {
                        const parts = clickedLabel.split('>').map(s => s.trim());
                        const parentCat = parts[0];
                        const subCat = parts[1];
                        const catSelect = document.getElementById('dash-filter-cat');
                        if (catSelect) {
                            catSelect.value = parentCat;
                            onDashboardCategoryChange();
                            setTimeout(() => {
                                const subSelect = document.getElementById('dash-filter-subcat');
                                if (subSelect) {
                                    subSelect.value = subCat;
                                    fetchDashboardStats();
                                }
                            }, 100);
                        }
                        showToast(`Filtrando por subcategoría: ${clickedLabel}`, 'info');
                    } else {
                        const catSelect = document.getElementById('dash-filter-cat');
                        if (catSelect) {
                            catSelect.value = clickedLabel;
                            onDashboardCategoryChange();
                            showToast(`Filtrando ranking por rubro: ${clickedLabel}`, 'info');
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { weight: 'bold', family: 'Albert Sans' },
                        boxWidth: 14,
                        padding: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + formatCurrency(context.raw);
                        }
                    }
                }
            }
        }
    });
}

function renderRankingTable() {
    const tbody = document.getElementById('tbl-ranking-body');
    if (!tbody) return;

    const searchTerm = (document.getElementById('input-search-ranking')?.value || '').toLowerCase().trim();
    const limitVal = document.getElementById('select-ranking-limit')?.value || '25';

    let list = [...currentRankingList];

    if (searchTerm) {
        list = list.filter(p =>
            (p.razon_social || '').toLowerCase().includes(searchTerm) ||
            (p.alias || '').toLowerCase().includes(searchTerm) ||
            (p.cuit || '').toLowerCase().includes(searchTerm) ||
            (p.categoria || '').toLowerCase().includes(searchTerm) ||
            (p.subcategoria || '').toLowerCase().includes(searchTerm)
        );
    }

    const totalCount = list.length;
    const badge = document.getElementById('ranking-count-badge');
    const filterCat = document.getElementById('dash-filter-cat')?.value || 'all';
    const filterSub = document.getElementById('dash-filter-subcat')?.value || 'all';

    if (badge) {
        badge.textContent = `${totalCount} proveedor${totalCount === 1 ? '' : 'es'}`;
    }

    const headerTitle = document.getElementById('ranking-header-title');
    const headerSub = document.getElementById('ranking-header-subtitle');
    if (headerTitle) {
        if (filterCat && filterCat !== 'all') {
            const subPart = (filterSub && filterSub !== 'all') ? ` > ${filterSub}` : '';
            headerTitle.textContent = `🏆 Ranking de Consumo en ${filterCat}${subPart}`;
        } else {
            headerTitle.textContent = '🏆 Ranking de Consumo & Facturación por Proveedor';
        }
    }
    if (headerSub) {
        if (filterCat && filterCat !== 'all') {
            headerSub.textContent = `Proveedores ordenados por facturación en el rubro ${filterCat}.`;
        } else {
            headerSub.textContent = 'Listado ordenado por mayor volumen de facturación según los filtros aplicados.';
        }
    }

    if (limitVal !== 'all') {
        const numLimit = parseInt(limitVal, 10);
        if (!isNaN(numLimit)) list = list.slice(0, numLimit);
    }

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 2.5rem;">No se encontraron proveedores para los filtros seleccionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(p => {
        let rankBadge = `<span style="font-weight: 800; color: #64748b; font-size: 0.9rem;">#${p.rank}</span>`;
        if (p.rank === 1) rankBadge = `<span style="background: #fef08a; color: #854d0e; padding: 3px 8px; border-radius: 999px; font-weight: 800; font-size: 0.85rem;"><i class="fa-solid fa-crown"></i> #1</span>`;
        else if (p.rank === 2) rankBadge = `<span style="background: #f1f5f9; color: #334155; padding: 3px 8px; border-radius: 999px; font-weight: 800; font-size: 0.85rem;"><i class="fa-solid fa-medal"></i> #2</span>`;
        else if (p.rank === 3) rankBadge = `<span style="background: #ffedd5; color: #9a3412; padding: 3px 8px; border-radius: 999px; font-weight: 800; font-size: 0.85rem;"><i class="fa-solid fa-medal"></i> #3</span>`;

        const hasAlias = Boolean(p.alias && p.alias.trim());
        const mainName = hasAlias ? p.alias : p.razon_social;
        const subName = hasAlias ? p.razon_social : '';

        return `
            <tr>
                <td style="text-align: center;">${rankBadge}</td>
                <td>
                    <div style="font-weight: 800; color: #0f172a; font-size: 0.95rem;">${escapeHtml(mainName)}</div>
                    ${subName ? `<div style="font-size: 0.76rem; color: #64748b; font-weight: 500;">${escapeHtml(subName)}</div>` : ''}
                    <div style="font-family: monospace; font-size: 0.74rem; color: #94a3b8;">${escapeHtml(p.cuit || '')}</div>
                </td>
                <td>
                    <span class="badge" style="background: #eff6ff; color: #1d4ed8; font-weight: 700; font-size: 0.78rem; padding: 3px 8px; border-radius: 6px; border: 1px solid #bfdbfe;">
                        ${escapeHtml(p.categoria || 'General')}
                    </span>
                </td>
                <td>
                    ${p.subcategoria ? `
                        <span class="badge" style="background: #f8fafc; color: #475569; font-weight: 600; font-size: 0.76rem; padding: 2px 7px; border-radius: 6px; border: 1px solid #cbd5e1;">
                            ${escapeHtml(p.subcategoria)}
                        </span>
                    ` : `<span style="color: #cbd5e1; font-size: 0.8rem;">-</span>`}
                </td>
                <td style="text-align: center;">
                    <span style="background: #f1f5f9; color: #334155; font-weight: 700; font-size: 0.8rem; padding: 2px 8px; border-radius: 999px;">
                        ${p.comprobantes_count}
                    </span>
                </td>
                <td style="text-align: right; font-weight: 800; color: #0f172a; font-size: 0.95rem;">
                    ${formatCurrency(p.total)}
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex: 1; background: #f1f5f9; border-radius: 999px; height: 7px; overflow: hidden;">
                            <div style="background: var(--primary-accent); height: 100%; width: ${Math.min(p.porcentaje, 100)}%; border-radius: 999px;"></div>
                        </div>
                        <span style="font-size: 0.78rem; font-weight: 700; color: #475569; min-width: 42px; text-align: right;">${p.porcentaje}%</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterRankingTable(term) {
    renderRankingTable();
}

// ==========================================
// GESTOR DE CATEGORÍAS Y SUBCATEGORÍAS
// ==========================================

function toggleCategoryManager() {
    const body = document.getElementById('category-manager-body');
    const toggleText = document.getElementById('cat-mgr-toggle-text');
    const chevron = document.getElementById('cat-mgr-chevron');
    if (!body) return;
    if (body.style.display === 'none' || !body.style.display) {
        body.style.display = 'block';
        if (toggleText) toggleText.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Ocultar Panel';
        if (chevron) chevron.className = 'fa-solid fa-chevron-up';
    } else {
        body.style.display = 'none';
        if (toggleText) toggleText.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Mostrar Panel';
        if (chevron) chevron.className = 'fa-solid fa-chevron-down';
    }
}

async function loadCategories() {
    try {
        const res = await fetch('/api/categorias');
        const data = await res.json();
        categoriesTree = data.tree || [];
        categoriesFlat = data.flat || [];
        renderCategoriesTree();
        populateParentCategorySelect();
        populateDashboardFilterCategories();
    } catch (e) {
        console.error("Error cargando categorías:", e);
    }
}

function populateParentCategorySelect() {
    const select = document.getElementById('cat-padre-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Ninguna (Categoría Principal) --</option>';
    categoriesTree.forEach(cat => {
        select.innerHTML += `<option value="${cat.id}">${escapeHtml(cat.nombre)}</option>`;
    });
}

function renderCategoriesTree() {
    const container = document.getElementById('categories-tree-container');
    if (!container) return;

    if (!categoriesTree || categoriesTree.length === 0) {
        container.innerHTML = `<div style="text-align:center; color: #64748b; padding: 1.5rem; font-size: 0.85rem;">No hay categorías creadas. Agrega una arriba.</div>`;
        return;
    }

    container.innerHTML = categoriesTree.map(cat => {
        const subList = cat.subcategorias || [];
        return `
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 700; color: #0f172a; font-size: 0.92rem; display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${escapeHtml(cat.color || '#3b82f6')};"></span>
                        ${escapeHtml(cat.nombre)}
                        <span style="font-size: 0.72rem; background: #f1f5f9; color: #64748b; padding: 1px 6px; border-radius: 10px; font-weight: 600;">${subList.length} sub</span>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-sm" style="padding: 2px 8px; font-size: 0.75rem; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 4px; font-weight: 600; cursor: pointer;" onclick="promptAddSubcategory(${cat.id}, '${escapeHtml(cat.nombre)}')">
                            <i class="fa-solid fa-plus"></i> Sub
                        </button>
                        <button class="btn btn-sm" style="padding: 2px 8px; font-size: 0.75rem; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 4px; font-weight: 600; cursor: pointer;" onclick="deleteCategory(${cat.id}, '${escapeHtml(cat.nombre)}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                ${subList.length > 0 ? `
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 0.5rem; padding-left: 1rem; border-left: 2px solid #e2e8f0;">
                        ${subList.map(sub => `
                            <span style="display: inline-flex; align-items: center; gap: 6px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 2px 8px; font-size: 0.8rem; font-weight: 600; color: #334155;">
                                ${escapeHtml(sub.nombre)}
                                <i class="fa-solid fa-xmark" style="cursor: pointer; color: #94a3b8; font-size: 0.75rem;" title="Eliminar subcategoría" onclick="deleteCategory(${sub.id}, '${escapeHtml(sub.nombre)}')"></i>
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

async function createNewCategory() {
    const input = document.getElementById('new-cat-name') || document.getElementById('cat-nuevo-nombre');
    const selectPadre = document.getElementById('cat-padre-select');
    if (!input) return;

    const nombre = input.value.trim();
    if (!nombre) {
        showToast('Ingresa un nombre para la categoría', 'error');
        return;
    }

    const padreId = selectPadre && selectPadre.value ? parseInt(selectPadre.value) : null;

    try {
        const res = await fetch('/api/categorias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre, padre_id: padreId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Categoría '${nombre}' guardada con éxito`, 'success');
            input.value = '';
            const altInput = document.getElementById('cat-nuevo-nombre') || document.getElementById('new-cat-name');
            if (altInput) altInput.value = '';
            if (selectPadre) selectPadre.value = '';
            await loadCategories();
            renderAliasTable(allProveedoresList);
        } else {
            showToast(data.message || 'Error al crear categoría', 'error');
        }
    } catch (e) {
        showToast('Error de conexión al crear categoría', 'error');
    }
}

async function promptAddSubcategory(padreId, padreNombre) {
    const subNombre = prompt(`Ingresa el nombre de la subcategoría para "${padreNombre}":`);
    if (!subNombre || !subNombre.trim()) return;

    try {
        const res = await fetch('/api/categorias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: subNombre.trim(), padre_id: padreId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Subcategoría '${subNombre}' agregada a ${padreNombre}`, 'success');
            await loadCategories();
            renderAliasTable(allProveedoresList);
        } else {
            showToast(data.message || 'Error al agregar subcategoría', 'error');
        }
    } catch (e) {
        showToast('Error de conexión al crear subcategoría', 'error');
    }
}

async function deleteCategory(id, name) {
    if (!confirm(`¿Estás seguro de eliminar la categoría o subcategoría "${name}"?`)) return;

    try {
        const res = await fetch(`/api/categorias/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Categoría eliminada`, 'success');
            await loadCategories();
            renderAliasTable(allProveedoresList);
        } else {
            showToast(data.message || 'Error al eliminar', 'error');
        }
    } catch (e) {
        showToast('Error de conexión al eliminar categoría', 'error');
    }
}

// ==========================================
// TAB 5: GESTIÓN DE ALIAS Y CATEGORÍAS DE PROVEEDORES
// ==========================================

async function loadProveedoresAlias() {
    try {
        const res = await fetch('/api/proveedores/alias');
        const data = await res.json();
        allProveedoresList = data.proveedores || [];
        allProveedoresList.forEach(p => {
            if (p.alias) aliasMap[p.nombre] = p.alias;
        });
        const badge = document.getElementById('alias-count-badge');
        if (badge) badge.textContent = `${allProveedoresList.length} proveedores`;
        renderAliasTable(allProveedoresList);
    } catch (e) {
        console.error("Error cargando alias de proveedores:", e);
    }
}

function filterAliasTable(search) {
    const term = (search || '').toLowerCase().trim();
    if (!term) {
        const badge = document.getElementById('alias-count-badge');
        if (badge) badge.textContent = `${allProveedoresList.length} proveedores`;
        renderAliasTable(allProveedoresList);
        return;
    }
    const filtered = allProveedoresList.filter(p => 
        (p.nombre || '').toLowerCase().includes(term) ||
        (p.alias || '').toLowerCase().includes(term) ||
        (p.cuit || '').toLowerCase().includes(term) ||
        (p.categoria || '').toLowerCase().includes(term) ||
        (p.subcategoria || '').toLowerCase().includes(term)
    );
    const badge = document.getElementById('alias-count-badge');
    if (badge) badge.textContent = `${filtered.length} coincidentes de ${allProveedoresList.length}`;
    renderAliasTable(filtered);
}

function renderAliasTable(list) {
    const tbody = document.getElementById('tbl-alias-body');
    if (!tbody) return;

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #64748b; padding: 2rem;">No se encontraron proveedores coincidentes.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map((p, idx) => {
        const pId = p.id || idx;
        const inputId = `alias-input-${pId}`;
        const btnId = `alias-btn-${pId}`;
        const catSelectId = `cat-select-${pId}`;
        const subcatSelectId = `subcat-select-${pId}`;
        const safeNombre = escapeHtml(p.nombre || '');
        const currentAlias = escapeHtml(p.alias || '');
        const currentCat = p.categoria || '';
        const currentSubcat = p.subcategoria || '';

        // Opciones de categoría principal únicas
        let catOptions = `<option value="">-- Sin Rubro --</option>`;
        const seenCatNames = new Set();
        categoriesTree.forEach(c => {
            const catLower = (c.nombre || '').toLowerCase().trim();
            if (!seenCatNames.has(catLower)) {
                seenCatNames.add(catLower);
                const isSel = (catLower === currentCat.toLowerCase().trim()) ? 'selected' : '';
                catOptions += `<option value="${escapeHtml(c.nombre)}" ${isSel}>${escapeHtml(c.nombre)}</option>`;
            }
        });
        if (currentCat && !seenCatNames.has(currentCat.toLowerCase().trim())) {
            catOptions += `<option value="${escapeHtml(currentCat)}" selected>${escapeHtml(currentCat)}</option>`;
        }

        // Opciones de subcategoría según la categoría actual
        let subcatOptions = `<option value="">-- Ninguna --</option>`;
        const seenSubcatNames = new Set();
        const matchedCat = categoriesTree.find(c => (c.nombre || '').toLowerCase().trim() === currentCat.toLowerCase().trim());
        if (matchedCat && matchedCat.subcategorias) {
            matchedCat.subcategorias.forEach(s => {
                const subLower = (s.nombre || '').toLowerCase().trim();
                if (!seenSubcatNames.has(subLower)) {
                    seenSubcatNames.add(subLower);
                    const isSelSub = (subLower === currentSubcat.toLowerCase().trim()) ? 'selected' : '';
                    subcatOptions += `<option value="${escapeHtml(s.nombre)}" ${isSelSub}>${escapeHtml(s.nombre)}</option>`;
                }
            });
        }
        if (currentSubcat && !seenSubcatNames.has(currentSubcat.toLowerCase().trim())) {
            subcatOptions += `<option value="${escapeHtml(currentSubcat)}" selected>${escapeHtml(currentSubcat)}</option>`;
        }

        return `
            <tr>
                <td style="font-weight: 700; color: #0f172a;" title="${safeNombre}">${truncateText(safeNombre, 35)}</td>
                <td style="font-family: monospace; color: #64748b; font-size: 0.82rem;">${escapeHtml(p.cuit || '-')}</td>
                <td>
                    <select id="${catSelectId}" class="form-control" style="font-size: 0.82rem; font-weight: 600; padding: 0.25rem 0.5rem; border-radius: 6px; border: 1px solid #cbd5e1; width: 100%; min-width: 130px;" onchange="onCategorySelectChange('${catSelectId}', '${subcatSelectId}')">
                        ${catOptions}
                    </select>
                </td>
                <td>
                    <select id="${subcatSelectId}" class="form-control" style="font-size: 0.82rem; font-weight: 600; padding: 0.25rem 0.5rem; border-radius: 6px; border: 1px solid #cbd5e1; width: 100%; min-width: 120px;">
                        ${subcatOptions}
                    </select>
                </td>
                <td>
                    <input type="text" id="${inputId}" class="form-control" placeholder="Nombre de fantasía" value="${currentAlias}" style="width: 100%; padding: 0.35rem 0.6rem; font-size: 0.85rem; font-weight: 700; border-radius: 6px; border: 1px solid #cbd5e1;" onkeydown="if(event.key==='Enter') saveProveedorAlias('${safeNombre}', '${inputId}', '${btnId}', '${catSelectId}', '${subcatSelectId}')">
                </td>
                <td style="text-align: center;">
                    <button id="${btnId}" class="btn btn-sm" style="background: var(--primary-accent); color: #ffffff; border: none; font-weight: 700; border-radius: 6px; padding: 5px 12px; cursor: pointer;" onclick="saveProveedorAlias('${safeNombre}', '${inputId}', '${btnId}', '${catSelectId}', '${subcatSelectId}')">
                        <i class="fa-solid fa-floppy-disk"></i> Guardar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function onCategorySelectChange(catSelectId, subcatSelectId) {
    const catSelect = document.getElementById(catSelectId);
    const subcatSelect = document.getElementById(subcatSelectId);
    if (!catSelect || !subcatSelect) return;

    const selectedCatName = catSelect.value.trim().toLowerCase();
    subcatSelect.innerHTML = '<option value="">-- Ninguna --</option>';

    const matchedCat = categoriesTree.find(c => c.nombre.toLowerCase() === selectedCatName);
    if (matchedCat && matchedCat.subcategorias) {
        matchedCat.subcategorias.forEach(s => {
            subcatSelect.innerHTML += `<option value="${escapeHtml(s.nombre)}">${escapeHtml(s.nombre)}</option>`;
        });
    }
}

async function saveProveedorAlias(nombre, inputId, btnId, catSelectId, subcatSelectId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    const catSelect = document.getElementById(catSelectId);
    const subcatSelect = document.getElementById(subcatSelectId);
    if (!input) return;

    const newAlias = input.value.trim();
    const categoria = catSelect ? catSelect.value.trim() : '';
    const subcategoria = subcatSelect ? subcatSelect.value.trim() : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    }

    try {
        const res = await fetch('/api/proveedores/alias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: nombre,
                alias: newAlias,
                categoria: categoria,
                subcategoria: subcategoria
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Datos actualizados para ${nombre}`, 'success');
            aliasMap[nombre] = newAlias;
            const provObj = allProveedoresList.find(p => p.nombre === nombre);
            if (provObj) {
                provObj.alias = newAlias;
                provObj.categoria = categoria;
                provObj.subcategoria = subcategoria;
            }
            renderArcaCloudTable();
            fetchCuentasPagarCloud();
            fetchDashboardStats();
        } else {
            showToast(data.message || 'Error al guardar datos', 'error');
        }
    } catch (e) {
        showToast('Error de conexión al guardar datos', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-check"></i> Listo`;
            setTimeout(() => {
                if (btn) btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Guardar`;
            }, 2000);
        }
    }
}

// ==========================================
// TABS & UI HELPERS
// ==========================================

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));

    const targetEl = document.getElementById(tabId);
    if (targetEl) targetEl.style.display = 'block';

    if (tabId === 'tab-arca') document.getElementById('btn-tab-arca').classList.add('active');
    if (tabId === 'tab-cuentas') document.getElementById('btn-tab-cuentas').classList.add('active');
    if (tabId === 'tab-metodos') document.getElementById('btn-tab-metodos').classList.add('active');
    if (tabId === 'tab-dashboard') {
        document.getElementById('btn-tab-dashboard').classList.add('active');
        fetchDashboardStats();
    }
    if (tabId === 'tab-alias') {
        document.getElementById('btn-tab-alias').classList.add('active');
        loadProveedoresAlias();
    }
}

async function triggerManualSync() {
    const badge = document.getElementById('cloud-sync-badge');
    const text = document.getElementById('cloud-sync-text');
    badge.classList.add('syncing');
    text.textContent = 'Sincronizando...';

    try {
        const res = await fetch('/api/firebase/full_resync', { method: 'POST' });
        const data = await res.json();
        showToast('Nube reconciliada y sincronizada con éxito', 'success');
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
