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
// TAB 4: DASHBOARD DE GRÁFICOS (CHART.JS)
// ==========================================

async function fetchDashboardStats() {
    try {
        const param = currentMonth && currentMonth !== 'all' ? '?mes=' + currentMonth : '';
        const res = await fetch('/api/dashboard/stats' + param);
        const data = await res.json();
        renderDashboardCharts(data);
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

    // 2. Gráfico por Categoría (Pinamar, Leloir, Socios)
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
                    backgroundColor: ['#ea580c', '#2563eb', '#059669', '#7c3aed', '#64748b'],
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

    // 4. Gráfico Top Proveedores
    const ctxTop = document.getElementById('chart-top-proveedores');
    if (ctxTop) {
        if (chartTop) chartTop.destroy();
        const topList = data.top_proveedores || [];
        const topLabels = topList.map(t => t.display_name);
        const topValues = topList.map(t => t.total);

        chartTop = new Chart(ctxTop, {
            type: 'bar',
            data: {
                labels: topLabels,
                datasets: [{
                    label: 'Gasto Total',
                    data: topValues,
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
}

// ==========================================
// TAB 5: GESTIÓN DE ALIAS DE PROVEEDORES
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
        (p.categoria || '').toLowerCase().includes(term)
    );
    const badge = document.getElementById('alias-count-badge');
    if (badge) badge.textContent = `${filtered.length} coincidentes de ${allProveedoresList.length}`;
    renderAliasTable(filtered);
}

function renderAliasTable(list) {
    const tbody = document.getElementById('tbl-alias-body');
    if (!tbody) return;

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: #64748b; padding: 2rem;">No se encontraron proveedores coincidentes.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map((p, idx) => {
        const inputId = `alias-input-${p.id || idx}`;
        const btnId = `alias-btn-${p.id || idx}`;
        const safeNombre = escapeHtml(p.nombre || '');
        const currentAlias = escapeHtml(p.alias || '');

        return `
            <tr>
                <td style="font-weight: 700; color: #0f172a;" title="${safeNombre}">${truncateText(safeNombre, 35)}</td>
                <td style="font-family: monospace; color: #64748b; font-size: 0.82rem;">${escapeHtml(p.cuit || '-')}</td>
                <td><span class="badge" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; font-weight: 600; font-size: 0.75rem; padding: 2px 7px;">${escapeHtml(p.categoria || 'General')}</span></td>
                <td>
                    <input type="text" id="${inputId}" class="form-control" placeholder="Ej: PEPE CONGELADOS" value="${currentAlias}" style="width: 100%; padding: 0.35rem 0.6rem; font-size: 0.85rem; font-weight: 700; border-radius: 6px; border: 1px solid #cbd5e1;" onkeydown="if(event.key==='Enter') saveProveedorAlias('${safeNombre}', '${inputId}', '${btnId}')">
                </td>
                <td style="text-align: center;">
                    <button id="${btnId}" class="btn btn-sm" style="background: var(--primary-accent); color: #ffffff; border: none; font-weight: 700; border-radius: 6px; padding: 4px 10px; cursor: pointer;" onclick="saveProveedorAlias('${safeNombre}', '${inputId}', '${btnId}')">
                        <i class="fa-solid fa-floppy-disk"></i> Guardar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function saveProveedorAlias(nombre, inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input) return;

    const newAlias = input.value.trim();
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    }

    try {
        const res = await fetch('/api/proveedores/alias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre, alias: newAlias })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Alias guardado para ${nombre}`, 'success');
            aliasMap[nombre] = newAlias;
            const provObj = allProveedoresList.find(p => p.nombre === nombre);
            if (provObj) provObj.alias = newAlias;
            renderArcaCloudTable();
            fetchCuentasPagarCloud();
            fetchDashboardStats();
        } else {
            showToast(data.message || 'Error al guardar alias', 'error');
        }
    } catch (e) {
        showToast('Error de conexión al guardar alias', 'error');
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
