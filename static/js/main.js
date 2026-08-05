document.addEventListener('DOMContentLoaded', () => {
    // --- Utility: HTML Escape ---
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- Navigation ---
    const allTabItems = document.querySelectorAll('[data-tab]');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const groupFacturas = document.getElementById('group-facturas');

    let currentSelectedMonth = '';
    let currentActiveTab = 'empresa';
    const monthNamesEs = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    async function fetchAvailableMonths() {
        const select = document.getElementById('global-month-select');
        if (!select) return;

        try {
            const res = await fetch('/api/meses_disponibles');
            const data = await res.json();

            select.innerHTML = '';

            const arcaSelect = document.getElementById('arca-month-filter');
            if (arcaSelect) {
                // Keep the default option
                arcaSelect.innerHTML = '<option value="all">Todos los meses</option>';
            }

            data.meses.forEach(m => {
                const parts = m.split('-');
                const y = parts[0];
                const mIdx = parseInt(parts[1], 10) - 1;
                const label = `${monthNamesEs[mIdx] || parts[1]} ${y}`;

                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = label;
                if (m === data.mes_actual && !currentSelectedMonth) {
                    opt.selected = true;
                    currentSelectedMonth = m;
                } else if (m === currentSelectedMonth) {
                    opt.selected = true;
                }
                select.appendChild(opt);

                if (arcaSelect) {
                    const optArca = document.createElement('option');
                    optArca.value = m;
                    optArca.textContent = label;
                    if (m === currentSelectedMonth) optArca.selected = true;
                    arcaSelect.appendChild(optArca);
                }
            });

            if (!currentSelectedMonth && select.options.length > 0) {
                currentSelectedMonth = select.options[0].value;
            }
        } catch (e) {
            console.error("Error cargando meses disponibles:", e);
        }
    }

    fetchAvailableMonths();

    const globalMonthSelect = document.getElementById('global-month-select');
    if (globalMonthSelect) {
        globalMonthSelect.addEventListener('change', (e) => {
            currentSelectedMonth = e.target.value;
            const subtitle = document.getElementById('global-month-subtitle');
            if (subtitle) subtitle.textContent = `Filtro mensual activo (${e.target.options[e.target.selectedIndex].text}). Todos los módulos muestran los registros de este período.`;
            switchTab(currentActiveTab);
        });
    }

    const btnMonthAll = document.getElementById('btn-month-all');
    if (btnMonthAll) {
        btnMonthAll.addEventListener('click', () => {
            currentSelectedMonth = 'all';
            const subtitle = document.getElementById('global-month-subtitle');
            if (subtitle) subtitle.textContent = `Mostrando Histórico Completo de la empresa (sin filtro de mes).`;
            switchTab(currentActiveTab);
        });
    }

    function switchTab(tabName) {
        currentActiveTab = tabName;
        // Remover active de todos los ítems de navegación
        allTabItems.forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        tabPanes.forEach(p => p.style.display = 'none');

        const activeLink = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeLink) activeLink.classList.add('active');

        // Gestionar estado del grupo Facturas
        const facturasSubTabs = ['dashboard', 'processed', 'remitos', 'upload'];
        if (facturasSubTabs.includes(tabName)) {
            if (groupFacturas) groupFacturas.classList.add('active');
        } else {
            if (groupFacturas) groupFacturas.classList.remove('active');
        }

        const targetTab = document.getElementById(`tab-${tabName}`);
        if (targetTab) {
            targetTab.style.display = 'block';
            targetTab.classList.remove('fade-in');
            void targetTab.offsetWidth;
            targetTab.classList.add('fade-in');
        }

        if (tabName === 'empresa') {
            fetchDashboardEmpresa();
        }
        if (tabName === 'dashboard') {
            fetchStatus();
            fetchProgress();
        }
        if (tabName === 'cuentas-pagar') {
            fetchCuentasPorPagar();
            fetchArcaCompras();
        }
        if (tabName === 'recaudacion') fetchRecaudacion();
        if (tabName === 'estacionamiento') fetchEstacionamiento();
        if (tabName === 'caja-chica') fetchCajaChica();
        if (tabName === 'gastos-fijos') fetchGastosFijos();
        if (tabName === 'suppliers') fetchSuppliers();
        if (tabName === 'processed') fetchProcessedInvoices();
        if (tabName === 'remitos') fetchProcessedRemitos();
        if (tabName === 'unrecognized') fetchUnrecognizedInvoices();
    }

    allTabItems.forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            switchTab(link.dataset.tab);
            if (link.classList.contains('nav-group-header')) {
                const group = link.closest('.nav-group');
                if (group) group.classList.toggle('collapsed');
            }
        });
    });

    // --- Toast Notifications ---
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-circle-xmark';
        if (type === 'warning') icon = 'fa-triangle-exclamation';

        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <div class="toast-content"><p>${message}</p></div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => {
                if (container.contains(toast)) container.removeChild(toast);
            }, 300);
        }, 5000);
    }

    // --- License Check ---
    const licenseStatusBadge = document.getElementById('license-status-badge');
    const licenseStatusText = document.getElementById('license-status-text');
    const inputHardwareId = document.getElementById('input-hardware-id');
    const btnCopyHwId = document.getElementById('btn-copy-hwid');
    const expBanner = document.getElementById('expiration-banner');
    const expText = document.getElementById('expiration-text');
    const btnSyncLicense = document.getElementById('btn-sync-license');
    let isLicenseValid = true; // Default to true until checked, or default to false and let check enable it

    async function fetchLicenseStatus(force = false) {
        try {
            const url = force ? '/api/license/status?force=true' : '/api/license/status';
            const res = await fetch(url);
            const data = await res.json();

            if (inputHardwareId) {
                inputHardwareId.value = data.hw_id || 'ERROR';
            }

            if (data.valid) {
                isLicenseValid = true;
                if (licenseStatusBadge) {
                    licenseStatusBadge.className = 'status-badge status-active';
                    licenseStatusText.textContent = data.message || 'Activa';
                }

                if (data.days_left !== undefined && data.days_left !== null && data.days_left <= 15) {
                    if (expBanner && expText) {
                        expBanner.style.display = 'block';
                        expText.textContent = `Atención: Tu licencia expirará en ${data.days_left} día(s).`;
                    }
                } else {
                    if (expBanner) expBanner.style.display = 'none';
                }
            } else {
                isLicenseValid = false;
                if (licenseStatusBadge) {
                    licenseStatusBadge.className = 'status-badge status-inactive';
                    licenseStatusText.textContent = 'Inactiva / No Registrada';
                }

                // Deshabilitar botones principales si hay referencias
                const bStart = document.getElementById('btn-start-watcher');
                const bStop = document.getElementById('btn-stop-watcher');
                const bScan = document.getElementById('btn-open-scanner');

                if (bStart) bStart.disabled = true;
                if (bStop) bStop.disabled = true;
                if (bScan) bScan.disabled = true;

                // Force update UI
                updateWatcherStatusUI(false);

                if (expBanner) expBanner.style.display = 'none';

                showToast(`Licencia Inválida: ${data.message || 'Contacta al administrador'}`, 'error');
            }
        } catch (error) {
            console.error("Error fetching license status:", error);
            if (licenseStatusBadge) {
                licenseStatusBadge.className = 'status-badge status-inactive';
                licenseStatusText.textContent = 'Error de Conexión';
            }
        }
    }

    if (btnCopyHwId) {
        btnCopyHwId.addEventListener('click', () => {
            if (inputHardwareId && inputHardwareId.value) {
                navigator.clipboard.writeText(inputHardwareId.value)
                    .then(() => showToast('Hardware ID copiado al portapapeles', 'success'))
                    .catch(err => showToast('Error al copiar ID', 'error'));
            }
        });
    }

    if (btnSyncLicense) {
        btnSyncLicense.addEventListener('click', async () => {
            const icon = btnSyncLicense.querySelector('i');
            icon.classList.add('fa-spin');
            await fetchLicenseStatus(true);
            icon.classList.remove('fa-spin');
            showToast('Licencia sincronizada con Firebase', 'success');
        });
    }

    // --- Dashboard & Watcher Controls ---
    const btnStart = document.getElementById('btn-start-watcher');
    const btnStop = document.getElementById('btn-stop-watcher');
    const btnScanner = document.getElementById('btn-open-scanner');

    const statusText = document.getElementById('watcher-status-text');
    const statusBadge = document.getElementById('watcher-status-badge');

    let prevUnrecognizedCount = null;

    const cardProcessed = document.getElementById('card-processed');
    const cardRemitos = document.getElementById('card-remitos');
    const cardUnrecognized = document.getElementById('card-unrecognized');

    if (cardProcessed) {
        cardProcessed.addEventListener('click', () => switchTab('processed'));
    }
    if (cardRemitos) {
        cardRemitos.addEventListener('click', () => switchTab('remitos'));
    }
    if (cardUnrecognized) {
        cardUnrecognized.addEventListener('click', () => switchTab('unrecognized'));
    }

    async function fetchStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();

            updateWatcherStatusUI(data.watcher_running);

            document.getElementById('stat-pending').textContent = data.stats.pending;
            document.getElementById('stat-processed').textContent = data.stats.processed;
            document.getElementById('stat-unrecognized').textContent = data.stats.unrecognized;
            if (document.getElementById('stat-remitos')) {
                document.getElementById('stat-remitos').textContent = data.stats.remitos || 0;
            }

            if (prevUnrecognizedCount !== null && data.stats.unrecognized > prevUnrecognizedCount) {
                showToast("¡Atención! Una factura no reconocida requiere revisión.", "warning");
            }
            prevUnrecognizedCount = data.stats.unrecognized;

            fetchUserHistory();
        } catch (error) {
            console.error("Error fetching status:", error);
        }
    }

    const progressContainer = document.getElementById('progress-container');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');
    const aiIndicator = document.getElementById('ai-processing-indicator');

    async function fetchProgress() {
        try {
            const res = await fetch('/api/progress');
            const data = await res.json();

            if (data.is_processing_batch) {
                progressContainer.style.display = 'block';
                let percent = 0;
                if (data.total > 0) {
                    percent = Math.round((data.processed / data.total) * 100);
                }
                progressBarFill.style.width = `${percent}%`;
                progressText.textContent = `${data.processed} / ${data.total} (${percent}%)`;
            } else {
                progressContainer.style.display = 'none';
            }

            if (data.is_ai_processing) {
                aiIndicator.style.display = 'block';
            } else {
                aiIndicator.style.display = 'none';
            }
        } catch (error) {
            console.error("Error fetching progress:", error);
        }
    }

    function updateWatcherStatusUI(isRunning) {
        if (!isLicenseValid) {
            statusText.textContent = 'BLOQUEADO (Sin Licencia)';
            statusBadge.className = 'status-badge status-inactive';
            if (btnStart) btnStart.disabled = true;
            if (btnStop) btnStop.disabled = true;
            return;
        }

        if (isRunning) {
            statusText.textContent = 'ACTIVO (Escuchando...)';
            statusBadge.className = 'status-badge status-active';
            btnStart.disabled = true;
            btnStop.disabled = false;
        } else {
            statusText.textContent = 'DETENIDO';
            statusBadge.className = 'status-badge status-inactive';
            btnStart.disabled = false;
            btnStop.disabled = true;
        }
    }

    btnStart.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/watcher/start', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, 'success');
                updateWatcherStatusUI(true);
            } else {
                showToast(data.message, 'error');
            }
        } catch (e) {
            showToast("Error al iniciar el vigía", 'error');
        }
    });

    btnStop.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/watcher/stop', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, 'success');
                updateWatcherStatusUI(false);
            } else {
                showToast(data.message, 'error');
            }
        } catch (e) {
            showToast("Error al detener el vigía", 'error');
        }
    });

    if (btnScanner) {
        btnScanner.addEventListener('click', async () => {
            // Animación temporal en el botón
            const originalHTML = btnScanner.innerHTML;
            btnScanner.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Escaneando...';
            btnScanner.disabled = true;

            try {
                const res = await fetch('/api/open_scanner', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    showToast(data.message, 'success');
                } else {
                    showToast("Error al abrir escáner automático", 'error');
                }
            } catch (e) {
                showToast("Error de conexión con el escáner", 'error');
            }

            // Habilitar botón de nuevo después de 5s para que no se quede pegado 
            // (el proceso de escaneo funciona en segundo plano)
            setTimeout(() => {
                btnScanner.innerHTML = originalHTML;
                btnScanner.disabled = false;
            }, 5000);
        });
    }



    // --- Suppliers Tab ---
    const suppliersTableBody = document.getElementById('suppliers-table-body');
    const searchInput = document.getElementById('search-suppliers');
    const btnRefreshSuppliers = document.getElementById('btn-refresh-suppliers');
    const noResultsMsg = document.getElementById('no-results-msg');
    const supplierCount = document.getElementById('supplier-count');

    // Stats Pill & Dropdown Elements
    const btnSupplierStats = document.getElementById('btn-supplier-stats');
    const supplierStatsDropdown = document.getElementById('supplier-stats-dropdown');
    const supplierStatsWrapper = document.querySelector('.supplier-stats-wrapper');
    const headerTotalSuppliers = document.getElementById('header-total-suppliers');
    const statsYearBadge = document.getElementById('stats-year-badge');
    const topSuppliersList = document.getElementById('top-suppliers-list');

    if (btnSupplierStats && supplierStatsDropdown) {
        btnSupplierStats.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = supplierStatsDropdown.classList.contains('show');
            if (isShowing) {
                supplierStatsDropdown.classList.remove('show');
                if (supplierStatsWrapper) supplierStatsWrapper.classList.remove('active');
            } else {
                supplierStatsDropdown.classList.add('show');
                if (supplierStatsWrapper) supplierStatsWrapper.classList.add('active');
            }
        });

        document.addEventListener('click', (e) => {
            if (supplierStatsWrapper && !supplierStatsWrapper.contains(e.target)) {
                supplierStatsDropdown.classList.remove('show');
                supplierStatsWrapper.classList.remove('active');
            }
        });
    }

    let allSuppliers = [];

    async function fetchSuppliers() {
        try {
            const res = await fetch('/api/suppliers');
            allSuppliers = await res.json();
            renderSuppliers(allSuppliers);
            fetchSupplierStats();
        } catch (error) {
            console.error("Error fetching suppliers:", error);
            showToast("Error al cargar proveedores", "error");
        }
    }

    async function fetchSupplierStats() {
        try {
            const res = await fetch('/api/suppliers/stats');
            const data = await res.json();

            if (headerTotalSuppliers) {
                headerTotalSuppliers.textContent = data.total_suppliers || 0;
            }
            if (statsYearBadge) {
                statsYearBadge.textContent = `Año ${data.current_year || new Date().getFullYear()}`;
            }

            renderTopSuppliers(data.top_suppliers || [], data.total_invoices_ytd || 0);
        } catch (error) {
            console.error("Error fetching supplier stats:", error);
        }
    }

    function renderTopSuppliers(topSuppliers, totalInvoicesYtd) {
        if (!topSuppliersList) return;
        topSuppliersList.innerHTML = '';

        if (topSuppliers.length === 0) {
            topSuppliersList.innerHTML = `
                <div style="text-align: center; padding: 1.5rem; color: var(--text-secondary); font-size: 0.85rem;">
                    <i class="fa-regular fa-folder-open" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                    No hay registros de facturas en el año actual.
                </div>
            `;
            return;
        }

        const maxCount = topSuppliers[0]?.count || 1;

        topSuppliers.forEach(item => {
            const row = document.createElement('div');
            row.className = 'top-supplier-item';

            let rankClass = '';
            if (item.rank === 1) rankClass = 'rank-1';
            else if (item.rank === 2) rankClass = 'rank-2';
            else if (item.rank === 3) rankClass = 'rank-3';

            const barWidth = Math.max(8, Math.round((item.count / maxCount) * 100));

            row.innerHTML = `
                <div class="rank-number ${rankClass}">${item.rank}</div>
                <div class="supplier-info">
                    <span class="supplier-name-text" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                    <div class="supplier-progress-bg">
                        <div class="supplier-progress-fill" style="width: ${barWidth}%;"></div>
                    </div>
                </div>
                <div class="supplier-invoice-count">
                    <span class="count-number">${item.count}</span>
                    <span class="count-label">facturas</span>
                </div>
            `;
            topSuppliersList.appendChild(row);
        });
    }

    function renderSuppliers(suppliersList) {
        suppliersTableBody.innerHTML = '';

        supplierCount.textContent = `${suppliersList.length} proveedores`;

        if (suppliersList.length === 0) {
            noResultsMsg.style.display = 'flex';
            document.querySelector('.table-container').style.display = 'none';
            return;
        }

        noResultsMsg.style.display = 'none';
        document.querySelector('.table-container').style.display = 'block';

        suppliersList.forEach(sup => {
            const tr = document.createElement('tr');

            // Name
            const tdName = document.createElement('td');
            tdName.innerHTML = `<strong>${sup.name}</strong>`;

            // Keywords
            const tdKw = document.createElement('td');
            let kwHtml = '';
            sup.keywords.forEach(kw => {
                kwHtml += `<span class="kw-tag">${kw}</span>`;
            });
            tdKw.innerHTML = kwHtml;

            // Regex
            const tdRegex = document.createElement('td');
            tdRegex.innerHTML = `<span class="code-snippet">${sup.regex}</span>`;

            tr.appendChild(tdName);
            tr.appendChild(tdKw);
            tr.appendChild(tdRegex);
            suppliersTableBody.appendChild(tr);
        });
    }

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allSuppliers.filter(sup => {
            return sup.name.toLowerCase().includes(query) ||
                sup.keywords.some(k => k.toLowerCase().includes(query));
        });
        renderSuppliers(filtered);
    });

    btnRefreshSuppliers.addEventListener('click', () => {
        searchInput.value = '';
        fetchSuppliers();
        showToast("Lista actualizada");
    });

    // --- Processed Invoices Tab ---
    const processedTreeContainer = document.getElementById('processed-tree-container');
    const searchProcessedInput = document.getElementById('search-processed');
    const btnRefreshProcessed = document.getElementById('btn-refresh-processed');
    const noProcessedMsg = document.getElementById('no-processed-msg');
    const processedCount = document.getElementById('processed-count');

    let allProcessedInvoices = [];

    async function fetchProcessedInvoices() {
        try {
            const res = await fetch('/api/processed_invoices');
            allProcessedInvoices = await res.json();
            renderProcessedTree(allProcessedInvoices);
        } catch (error) {
            console.error("Error fetching processed invoices:", error);
            showToast("Error al cargar facturas procesadas", "error");
        }
    }

    function renderProcessedTree(invoicesList) {
        processedTreeContainer.innerHTML = '';
        processedCount.textContent = `${invoicesList.length} facturas`;

        if (invoicesList.length === 0) {
            noProcessedMsg.style.display = 'flex';
            document.querySelector('#tab-processed .table-container').style.display = 'none';
            return;
        }

        noProcessedMsg.style.display = 'none';
        document.querySelector('#tab-processed .table-container').style.display = 'block';

        // Group by Year -> Month -> Supplier
        const tree = {};
        invoicesList.forEach(inv => {
            const parts = inv.date.split(' ');
            const month = parts[0] || 'N/A';
            const year = parts[1] || 'N/A';
            const s = inv.supplier || 'N/A';

            if (!tree[year]) tree[year] = {};
            if (!tree[year][month]) tree[year][month] = {};
            if (!tree[year][month][s]) tree[year][month][s] = [];

            tree[year][month][s].push(inv);
        });

        function buildFolder(name, contentHtml, isOpen = false) {
            const folderDiv = document.createElement('div');
            folderDiv.className = `tree-folder ${isOpen ? 'open' : ''}`;

            const folderNameDiv = document.createElement('div');
            folderNameDiv.className = 'tree-folder-name';
            folderNameDiv.innerHTML = `<i class="fa-solid fa-folder${isOpen ? '-open' : ''}"></i> <strong>${name}</strong>`;

            const folderContentDiv = document.createElement('div');
            folderContentDiv.className = 'tree-folder-content';
            folderContentDiv.appendChild(contentHtml);

            folderNameDiv.addEventListener('click', () => {
                const isOpenNow = folderDiv.classList.toggle('open');
                folderNameDiv.querySelector('i').className = `fa-solid fa-folder${isOpenNow ? '-open' : ''}`;
            });

            folderDiv.appendChild(folderNameDiv);
            folderDiv.appendChild(folderContentDiv);
            return folderDiv;
        }

        const rootDiv = document.createElement('div');
        const hasSearch = searchProcessedInput.value.trim().length > 0;

        Object.keys(tree).sort().reverse().forEach(year => {
            const yearContent = document.createElement('div');
            Object.keys(tree[year]).sort().forEach(month => {
                const monthContent = document.createElement('div');
                Object.keys(tree[year][month]).sort().forEach(supplier => {
                    const supplierContent = document.createElement('div');
                    tree[year][month][supplier].forEach(inv => {
                        const fileDiv = document.createElement('div');
                        fileDiv.className = 'tree-file';
                        fileDiv.innerHTML = `<i class="fa-solid fa-file-pdf"></i> <span>${inv.filename}</span>`;
                        fileDiv.addEventListener('click', () => openModal(inv));
                        supplierContent.appendChild(fileDiv);
                    });
                    monthContent.appendChild(buildFolder(supplier, supplierContent, true));
                });
                yearContent.appendChild(buildFolder(month, monthContent, true));
            });
            rootDiv.appendChild(buildFolder(year, yearContent, true));
        });

        processedTreeContainer.appendChild(rootDiv);
    }

    searchProcessedInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allProcessedInvoices.filter(inv => {
            return inv.filename.toLowerCase().includes(query) ||
                inv.supplier.toLowerCase().includes(query) ||
                inv.date.toLowerCase().includes(query);
        });
        renderProcessedTree(filtered);
    });

    btnRefreshProcessed.addEventListener('click', () => {
        searchProcessedInput.value = '';
        fetchProcessedInvoices();
        showToast("Historial actualizado");
    });

    // --- Remitos y Documentos No Fiscales ---
    const remitosTreeContainer = document.getElementById('remitos-tree-container');
    const remitosCount = document.getElementById('remitos-count');
    const noRemitosMsg = document.getElementById('no-remitos-msg');
    const searchRemitosInput = document.getElementById('search-remitos');
    const btnRefreshRemitos = document.getElementById('btn-refresh-remitos');
    let rawRemitosList = [];

    async function fetchProcessedRemitos() {
        try {
            const res = await fetch('/api/processed_remitos');
            rawRemitosList = await res.json();
            renderRemitosTree(rawRemitosList);
        } catch (e) {
            console.error("Error fetching processed remitos:", e);
            showToast("Error al cargar remitos", "error");
        }
    }

    function renderRemitosTree(list) {
        if (!remitosTreeContainer) return;
        remitosTreeContainer.innerHTML = '';
        remitosCount.textContent = `${list.length} remitos`;

        if (list.length === 0) {
            noRemitosMsg.style.display = 'flex';
            if (document.querySelector('#tab-remitos .table-container')) {
                document.querySelector('#tab-remitos .table-container').style.display = 'none';
            }
            return;
        }

        noRemitosMsg.style.display = 'none';
        if (document.querySelector('#tab-remitos .table-container')) {
            document.querySelector('#tab-remitos .table-container').style.display = 'block';
        }

        const tree = {};
        list.forEach(item => {
            const parts = item.date.split(' ');
            const month = parts[0] || 'N/A';
            const year = parts[1] || 'N/A';

            if (!tree[year]) tree[year] = {};
            if (!tree[year][month]) tree[year][month] = [];
            tree[year][month].push(item);
        });

        function buildFolder(name, contentHtml, isOpen = true) {
            const folderDiv = document.createElement('div');
            folderDiv.className = `tree-folder ${isOpen ? 'open' : ''}`;

            const folderNameDiv = document.createElement('div');
            folderNameDiv.className = 'tree-folder-name';
            folderNameDiv.innerHTML = `<i class="fa-solid fa-folder${isOpen ? '-open' : ''}"></i> <strong>${name}</strong>`;

            const folderContentDiv = document.createElement('div');
            folderContentDiv.className = 'tree-folder-content';
            folderContentDiv.appendChild(contentHtml);

            folderNameDiv.addEventListener('click', () => {
                const isOpenNow = folderDiv.classList.toggle('open');
                folderNameDiv.querySelector('i').className = `fa-solid fa-folder${isOpenNow ? '-open' : ''}`;
            });

            folderDiv.appendChild(folderNameDiv);
            folderDiv.appendChild(folderContentDiv);
            return folderDiv;
        }

        const rootDiv = document.createElement('div');

        Object.keys(tree).sort().reverse().forEach(year => {
            const yearContent = document.createElement('div');
            Object.keys(tree[year]).sort().forEach(month => {
                const monthContent = document.createElement('div');
                tree[year][month].forEach(item => {
                    const fileDiv = document.createElement('div');
                    fileDiv.className = 'tree-file';
                    fileDiv.innerHTML = `<i class="fa-solid fa-receipt" style="color: #9b59b6;"></i> <span>${item.filename}</span>`;
                    fileDiv.addEventListener('click', () => openModal(item, '/api/remito_file/'));
                    monthContent.appendChild(fileDiv);
                });
                yearContent.appendChild(buildFolder(month, monthContent, true));
            });
            rootDiv.appendChild(buildFolder(year, yearContent, true));
        });

        remitosTreeContainer.appendChild(rootDiv);
    }

    if (searchRemitosInput) {
        searchRemitosInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = rawRemitosList.filter(item =>
                item.filename.toLowerCase().includes(query) ||
                item.date.toLowerCase().includes(query)
            );
            renderRemitosTree(filtered);
        });
    }

    if (btnRefreshRemitos) {
        btnRefreshRemitos.addEventListener('click', () => {
            if (searchRemitosInput) searchRemitosInput.value = '';
            fetchProcessedRemitos();
            showToast("Remitos actualizados");
        });
    }

    // --- Facturas No Reconocidas con Diagnóstico ---
    const unrecognizedTableBody = document.getElementById('unrecognized-table-body');
    const unrecognizedCount = document.getElementById('unrecognized-count');
    const noUnrecognizedMsg = document.getElementById('no-unrecognized-msg');
    const searchUnrecognizedInput = document.getElementById('search-unrecognized');
    const btnRefreshUnrecognized = document.getElementById('btn-refresh-unrecognized');
    let rawUnrecognizedList = [];

    async function fetchUnrecognizedInvoices() {
        try {
            const res = await fetch('/api/unrecognized_invoices');
            rawUnrecognizedList = await res.json();
            renderUnrecognizedTable(rawUnrecognizedList);
        } catch (e) {
            console.error("Error fetching unrecognized invoices:", e);
            showToast("Error al cargar facturas no reconocidas", "error");
        }
    }

    function renderUnrecognizedTable(list) {
        if (!unrecognizedTableBody) return;
        unrecognizedTableBody.innerHTML = '';
        unrecognizedCount.textContent = `${list.length} archivos`;

        if (list.length === 0) {
            noUnrecognizedMsg.style.display = 'flex';
            if (document.querySelector('#tab-unrecognized .table-container')) {
                document.querySelector('#tab-unrecognized .table-container').style.display = 'none';
            }
            return;
        }

        noUnrecognizedMsg.style.display = 'none';
        if (document.querySelector('#tab-unrecognized .table-container')) {
            document.querySelector('#tab-unrecognized .table-container').style.display = 'block';
        }

        list.forEach(item => {
            const tr = document.createElement('tr');

            const tdFile = document.createElement('td');
            tdFile.innerHTML = `<i class="fa-solid fa-file-pdf" style="color: #b91c1c; margin-right: 8px;"></i><strong>${item.filename}</strong>`;

            const tdErrorType = document.createElement('td');
            tdErrorType.innerHTML = `<span class="badge" style="background: rgba(231,76,60,0.2); color: #b91c1c; border: 1px solid rgba(231,76,60,0.3);">${item.error_type}</span>`;

            const tdDate = document.createElement('td');
            tdDate.textContent = item.date || '-';

            const tdDetails = document.createElement('td');
            tdDetails.style.maxWidth = '380px';
            tdDetails.style.fontSize = '0.85rem';
            tdDetails.style.color = 'var(--text-secondary)';
            tdDetails.style.whiteSpace = 'pre-line';
            tdDetails.textContent = item.details;

            const tdAction = document.createElement('td');
            const btnPreview = document.createElement('button');
            btnPreview.className = 'btn btn-secondary btn-icon';
            btnPreview.innerHTML = '<i class="fa-solid fa-eye"></i>';
            btnPreview.title = 'Previsualizar archivo';
            btnPreview.addEventListener('click', () => {
                openModal({ filename: item.filename, path: item.path, supplier: 'No Reconocida' }, '/api/unrecognized_file/');
            });
            tdAction.appendChild(btnPreview);

            tr.appendChild(tdFile);
            tr.appendChild(tdErrorType);
            tr.appendChild(tdDate);
            tr.appendChild(tdDetails);
            tr.appendChild(tdAction);

            unrecognizedTableBody.appendChild(tr);
        });
    }

    if (searchUnrecognizedInput) {
        searchUnrecognizedInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = rawUnrecognizedList.filter(item =>
                item.filename.toLowerCase().includes(query) ||
                item.error_type.toLowerCase().includes(query) ||
                item.details.toLowerCase().includes(query)
            );
            renderUnrecognizedTable(filtered);
        });
    }

    if (btnRefreshUnrecognized) {
        btnRefreshUnrecognized.addEventListener('click', () => {
            if (searchUnrecognizedInput) searchUnrecognizedInput.value = '';
            fetchUnrecognizedInvoices();
            showToast("No reconocidas actualizadas");
        });
    }

    // --- Modal Logic ---
    const modal = document.getElementById('file-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalIframe = document.getElementById('modal-iframe');
    const closeModalBtn = document.querySelector('.close-modal');

    function openModal(inv, baseUrl = '/api/file/') {
        modalTitle.textContent = inv.supplier ? `${inv.supplier} - ${inv.filename}` : inv.filename;
        const encodedPath = inv.path.split('/').map(encodeURIComponent).join('/');
        modalIframe.src = `${baseUrl}${encodedPath}`;
        modal.style.display = 'flex';
        modal.classList.add('fade-in');
    }

    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        modalIframe.src = '';
    });

    window.addEventListener('click', (e) => {
        if (e.target == modal) {
            modal.style.display = 'none';
            modalIframe.src = '';
        }
    });

    // --- Upload CSV Tab ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-upload');
    const uploadStatus = document.getElementById('upload-status');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        let dt = e.dataTransfer;
        let files = dt.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', function () {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.zip')) {
            showToast("Solo se admiten archivos .csv o .zip", "error");
            return;
        }
        uploadFile(file);
    }

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        dropZone.style.display = 'none';
        uploadStatus.style.display = 'block';

        try {
            const response = await fetch('/api/upload_csv', {
                method: 'POST',
                body: formData
            });

            let data;
            try {
                data = await response.json();
            } catch (e) {
                throw new Error(`Respuesta no válida del servidor (${response.status})`);
            }

            if (response.ok && data.success) {
                showToast(data.message || "Archivo procesado exitosamente", 'success');
                fetchSuppliers();
            } else {
                showToast(data.message || `Error al procesar el archivo (${response.status})`, 'error');
            }
        } catch (error) {
            console.error("Error upload:", error);
            showToast(error.message || "Error al subir el archivo", 'error');
        } finally {
            // Reset UI
            setTimeout(() => {
                uploadStatus.style.display = 'none';
                dropZone.style.display = 'block';
                fileInput.value = ''; // clear input
            }, 3000);
        }
    }

    // --- Invoice Upload ---
    const invoiceDropZone = document.getElementById('invoice-drop-zone');
    const invoiceFileInput = document.getElementById('invoice-file-upload');

    if (invoiceDropZone && invoiceFileInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            invoiceDropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            invoiceDropZone.addEventListener(eventName, () => {
                invoiceDropZone.classList.add('dragover');
                invoiceDropZone.style.background = 'rgba(74, 144, 226, 0.2)';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            invoiceDropZone.addEventListener(eventName, () => {
                invoiceDropZone.classList.remove('dragover');
                invoiceDropZone.style.background = 'rgba(0,0,0,0.1)';
            }, false);
        });

        invoiceDropZone.addEventListener('drop', (e) => {
            let dt = e.dataTransfer;
            let files = dt.files;
            handleInvoiceFiles(files);
        });

        invoiceFileInput.addEventListener('change', function () {
            handleInvoiceFiles(this.files);
        });

        function handleInvoiceFiles(files) {
            if (files.length === 0) return;
            for (let i = 0; i < files.length; i++) {
                uploadInvoice(files[i]);
            }
            invoiceFileInput.value = '';
        }

        async function uploadInvoice(file) {
            const validExts = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp'];
            const fileExt = '.' + file.name.split('.').pop().toLowerCase();

            if (!validExts.includes(fileExt)) {
                showToast(`Tipo de archivo no permitido: ${file.name}`, 'error');
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            // Cambiar icono temporalmente
            const icon = invoiceDropZone.querySelector('i');
            const oldClass = icon.className;
            icon.className = 'fa-solid fa-spinner fa-spin';

            try {
                const response = await fetch('/api/upload_invoice', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.success) {
                    showToast(`Carga exitosa: ${file.name}`, 'success');
                    fetchStatus(); // Refrescar contadores
                } else {
                    showToast(data.message || `Error al subir ${file.name}`, 'error');
                }
            } catch (error) {
                console.error("Error invoice upload:", error);
                showToast(`Error de red al subir ${file.name}`, 'error');
            } finally {
                icon.className = oldClass;
            }
        }
    }

    // --- Settings Tab ---
    const btnSaveApiKey = document.getElementById('btn-save-api-key');
    const inputApiKey = document.getElementById('input-api-key');

    if (btnSaveApiKey && inputApiKey) {
        // Cargar clave actual
        fetch('/api/settings/get_api_key')
            .then(res => res.json())
            .then(data => {
                if (data.api_key) inputApiKey.value = data.api_key;
            }).catch(e => console.error("Error loading API Key", e));

        btnSaveApiKey.addEventListener('click', async () => {
            const apiKey = inputApiKey.value.trim();
            if (!apiKey) {
                showToast("Por favor ingresa una API Key", "warning");
                return;
            }
            // Add loading state
            const originalHTML = btnSaveApiKey.innerHTML;
            btnSaveApiKey.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnSaveApiKey.disabled = true;

            try {
                const res = await fetch('/api/settings/api_key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_key: apiKey })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(data.message, 'success');
                } else {
                    showToast(data.message, 'error');
                }
            } catch (error) {
                showToast("Error de conexión al guardar", 'error');
            } finally {
                btnSaveApiKey.innerHTML = originalHTML;
                btnSaveApiKey.disabled = false;
            }
        });
    }

    // --- Driver.js Tutorial ---
    if (window.driver) {
        const driver = window.driver.js.driver;

        const driverObj = driver({
            showProgress: true,
            nextBtnText: 'Siguiente',
            prevBtnText: 'Anterior',
            doneBtnText: 'Entendido',
            steps: [
                { element: 'li[data-tab="dashboard"]', popover: { title: 'Panel General', description: 'Aquí podrás ver las estadísticas y controlar el inicio/fin del vigía de facturas.' } },
                { element: 'li[data-tab="processed"]', popover: { title: 'Facturas Procesadas', description: 'Revisa tus facturas organizadas automáticamente por año, mes y proveedor.' } },
                { element: 'li[data-tab="upload"]', popover: { title: 'Cargar CSV o ZIP', description: 'Sube aquí el archivo descargado de ARCA para registrar tus comprobantes.' } },
                { element: 'li[data-tab="settings"]', popover: { title: 'Ajustes de IA', description: 'Configura tu API Key de Gemini para que la IA lea automáticamente facturas difíciles o borrosas.' } }
            ]
        });

        const btnHelp = document.getElementById('btn-help');
        if (btnHelp) {
            btnHelp.addEventListener('click', () => {
                driverObj.drive();
            });
        }

        // Auto-start si es la primera vez (consultando SQLite)
        fetch('/api/configuraciones/pdfwatcher_tutorial_seen')
            .then(res => res.json())
            .then(data => {
                if (!data.valor) {
                    setTimeout(() => {
                        driverObj.drive();
                        fetch('/api/configuraciones/pdfwatcher_tutorial_seen', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ valor: 'true' })
                        }).catch(() => { });
                    }, 1000);
                }
            }).catch(() => { });
    }

    // --- Heartbeat Ping ---
    // Enviar ping cada 3 segundos para mantener el proceso vivo.
    // Si cerramos la pestaña, el backend no recibe pings y se auto-apagará en 15s.
    setInterval(() => {
        fetch('/api/ping', { method: 'POST' }).catch(() => { });
    }, 3000);

    // Init polling for status every 2 seconds if dashboard is active
    fetchLicenseStatus(); // Initial fetch
    fetchStatus();
    setInterval(() => {
        const activeTab = document.querySelector('.nav-links li.active');
        if (activeTab && activeTab.dataset.tab === 'dashboard') {
            fetchStatus();
            fetchProgress();
            // We can also poll license periodically if we want, e.g. every 10 mins
        }
    }, 2000);

    // --- Doctor Tab Logic ---
    const btnDoctorScan = document.getElementById('btn-doctor-scan');
    const btnDoctorFix = document.getElementById('btn-doctor-fix');
    const doctorResultsContainer = document.getElementById('doctor-results-container');
    const doctorResultsList = document.getElementById('doctor-results-list');
    const doctorCount = document.getElementById('doctor-count');

    let currentAnomalies = [];

    if (btnDoctorScan) {
        btnDoctorScan.addEventListener('click', async () => {
            const originalHTML = btnDoctorScan.innerHTML;
            btnDoctorScan.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Escaneando...';
            btnDoctorScan.disabled = true;
            btnDoctorFix.disabled = true;

            try {
                const res = await fetch('/api/doctor/scan');
                const data = await res.json();

                if (data.success) {
                    currentAnomalies = data.anomalies;
                    renderDoctorResults(currentAnomalies);
                } else {
                    showToast("Error al escanear: " + data.message, "error");
                }
            } catch (error) {
                showToast("Error de conexión con el Doctor", "error");
            } finally {
                btnDoctorScan.innerHTML = originalHTML;
                btnDoctorScan.disabled = false;
            }
        });
    }

    if (btnDoctorFix) {
        btnDoctorFix.addEventListener('click', async () => {
            if (currentAnomalies.length === 0) return;

            const originalHTML = btnDoctorFix.innerHTML;
            btnDoctorFix.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Curando...';
            btnDoctorFix.disabled = true;
            btnDoctorScan.disabled = true;

            try {
                const res = await fetch('/api/doctor/fix', { method: 'POST' });
                const data = await res.json();

                if (data.success) {
                    showToast(`Se aplicaron ${data.fixes} curas automáticas.`, "success");
                    if (data.errors.length > 0) {
                        showToast(`Hubo ${data.errors.length} errores al curar. Revisa la consola.`, "warning");
                        console.error("Errores del doctor:", data.errors);
                    }
                    // Rescan
                    btnDoctorScan.click();
                } else {
                    showToast("Error al aplicar curas: " + data.message, "error");
                }
            } catch (error) {
                showToast("Error de red al aplicar curas", "error");
            } finally {
                btnDoctorFix.innerHTML = originalHTML;
                btnDoctorScan.disabled = false;
            }
        });
    }

    function renderDoctorResults(anomalies) {
        doctorResultsContainer.style.display = 'block';
        doctorResultsList.innerHTML = '';
        doctorCount.textContent = `${anomalies.length} anomalías`;

        if (anomalies.length === 0) {
            doctorCount.className = "badge status-active";
            doctorResultsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--success);"><i class="fa-solid fa-check-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i><br>¡Todo está perfecto! No se encontraron anomalías.</div>';
            btnDoctorFix.disabled = true;
            return;
        }

        doctorCount.className = "badge status-inactive";
        btnDoctorFix.disabled = false;

        anomalies.forEach(anom => {
            const div = document.createElement('div');

            let color = "var(--text)";
            let icon = "fa-triangle-exclamation";

            if (anom.severity === 'high') { color = "var(--danger)"; icon = "fa-circle-xmark"; }
            else if (anom.severity === 'medium') { color = "var(--warning)"; }
            else if (anom.severity === 'low') { color = "var(--text-secondary)"; icon = "fa-info-circle"; }

            div.style.padding = "1rem";
            div.style.border = "1px solid rgba(255,255,255,0.1)";
            div.style.borderRadius = "0.5rem";
            div.style.background = "rgba(0,0,0,0.2)";

            div.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 1rem;">
                    <i class="fa-solid ${icon}" style="color: ${color}; margin-top: 0.2rem;"></i>
                    <div>
                        <strong style="color: ${color}; text-transform: uppercase; font-size: 0.8rem;">${anom.type.replace(/_/g, ' ')}</strong>
                        <p style="margin: 0.2rem 0; font-size: 0.95rem;">${anom.message}</p>
                        <small style="color: var(--text-secondary); word-break: break-all;"><code>${anom.path}</code></small>
                    </div>
                </div>
            `;
            doctorResultsList.appendChild(div);
        });
    }

    // --- ARCA Credentials & Bot Sync ---
    const inputArcaCuit = document.getElementById('input-arca-cuit');
    const inputArcaClave = document.getElementById('input-arca-clave');
    const inputArcaRepresentada = document.getElementById('input-arca-representada');
    const btnSaveArcaCreds = document.getElementById('btn-save-arca-creds');
    const arcaStatusBadge = document.getElementById('arca-status-badge');
    const arcaStatusText = document.getElementById('arca-status-text');
    const btnSyncArca = document.getElementById('btn-sync-arca');
    const btnSyncArcaUpload = document.getElementById('btn-sync-arca-upload');
    const arcaSyncStatusMsg = document.getElementById('arca-sync-status-msg');

    // Modal elements
    const arcaCredsModal = document.getElementById('arca-credentials-modal');
    const modalArcaCuit = document.getElementById('modal-arca-cuit');
    const modalArcaClave = document.getElementById('modal-arca-clave');
    const modalArcaRepresentada = document.getElementById('modal-arca-representada');
    const modalArcaFullYear = document.getElementById('modal-arca-full-year');
    const modalApiKey = document.getElementById('modal-api-key');
    const modalApiKeyStatus = document.getElementById('modal-api-key-status');
    const modalApiKeyHint = document.getElementById('modal-api-key-hint');
    const btnModalSaveSyncArca = document.getElementById('btn-modal-save-sync-arca');
    const closeArcaCredsModalBtns = document.querySelectorAll('.close-arca-creds-modal');

    let isArcaConfigured = false;

    async function checkApiKeyStatus() {
        try {
            const res = await fetch('/api/settings/get_api_key');
            const data = await res.json();
            const hasKey = data && data.api_key && data.api_key !== "TU_API_KEY_AQUI";
            if (modalApiKeyStatus) {
                if (hasKey) {
                    modalApiKeyStatus.className = 'badge badge-success';
                    modalApiKeyStatus.textContent = 'Configurada';
                    if (modalApiKey && !modalApiKey.value) modalApiKey.placeholder = '•••••••• (Clave activa)';
                    if (modalApiKeyHint) modalApiKeyHint.textContent = 'Tu API Key de Gemini está guardada y lista para usarse.';
                } else {
                    modalApiKeyStatus.className = 'badge badge-warning';
                    modalApiKeyStatus.textContent = 'Sin API Key';
                    if (modalApiKeyHint) modalApiKeyHint.textContent = 'Si posees una API Key, ingresala para habilitar el procesamiento por IA.';
                }
            }
            return hasKey;
        } catch (e) {
            console.error("Error checking API Key status:", e);
            return false;
        }
    }

    async function fetchArcaCredentials(autoShowModalIfMissing = false) {
        try {
            const res = await fetch('/api/arca/credentials');
            const data = await res.json();

            checkApiKeyStatus();

            if (data.configured) {
                isArcaConfigured = true;
                if (inputArcaCuit) inputArcaCuit.value = data.cuit || '';
                if (inputArcaRepresentada) inputArcaRepresentada.value = data.representada || '';
                if (inputArcaClave && data.has_clave) inputArcaClave.value = '••••••••';

                if (modalArcaCuit) modalArcaCuit.value = data.cuit || '';
                if (modalArcaRepresentada) modalArcaRepresentada.value = data.representada || '';
                if (modalArcaClave && data.has_clave) modalArcaClave.value = '••••••••';

                if (arcaStatusBadge && arcaStatusText) {
                    arcaStatusBadge.className = 'status-badge status-active';
                    arcaStatusText.textContent = 'Configurada';
                }
            } else {
                isArcaConfigured = false;
                if (arcaStatusBadge && arcaStatusText) {
                    arcaStatusBadge.className = 'status-badge status-inactive';
                    arcaStatusText.textContent = 'Sin configurar';
                }
                if (autoShowModalIfMissing && arcaCredsModal) {
                    showArcaCredsModal();
                }
            }
        } catch (e) {
            console.error("Error fetching ARCA credentials:", e);
        }
    }

    function showArcaCredsModal() {
        if (!arcaCredsModal) return;
        checkApiKeyStatus();
        arcaCredsModal.style.display = 'flex';
        arcaCredsModal.classList.add('fade-in');
    }

    function hideArcaCredsModal() {
        if (arcaCredsModal) arcaCredsModal.style.display = 'none';
    }

    closeArcaCredsModalBtns.forEach(btn => {
        btn.addEventListener('click', hideArcaCredsModal);
    });

    if (btnSaveArcaCreds) {
        btnSaveArcaCreds.addEventListener('click', async () => {
            const cuit = inputArcaCuit.value.trim();
            const clave = inputArcaClave.value.trim();
            const representada = inputArcaRepresentada ? inputArcaRepresentada.value.trim() : '';

            if (!cuit || cuit.length !== 11) {
                showToast("Ingresa un CUIT de usuario válido (11 dígitos)", "error");
                return;
            }
            if (!clave) {
                showToast("Ingresa la Clave Fiscal de ARCA", "error");
                return;
            }

            try {
                const res = await fetch('/api/arca/credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cuit, clave, representada })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(data.message, "success");
                    inputArcaClave.value = '••••••••';
                    fetchArcaCredentials();
                } else {
                    showToast(data.message || "Error al guardar credenciales", "error");
                }
            } catch (e) {
                console.error("Error saving ARCA creds:", e);
                showToast("Error de red al guardar credenciales de ARCA", "error");
            }
        });
    }

    if (btnModalSaveSyncArca) {
        btnModalSaveSyncArca.addEventListener('click', async () => {
            const cuit = modalArcaCuit ? modalArcaCuit.value.trim() : '';
            const clave = modalArcaClave ? modalArcaClave.value.trim() : '';
            const representada = modalArcaRepresentada ? modalArcaRepresentada.value.trim() : '';
            const apiKey = modalApiKey ? modalApiKey.value.trim() : '';
            const fullYear = modalArcaFullYear ? modalArcaFullYear.checked : true;

            if (!cuit || cuit.length !== 11) {
                showToast("Ingresa un CUIT de usuario válido (11 dígitos)", "error");
                return;
            }
            if (!clave) {
                showToast("Ingresa la Clave Fiscal de ARCA", "error");
                return;
            }

            const originalText = btnModalSaveSyncArca.innerHTML;
            btnModalSaveSyncArca.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnModalSaveSyncArca.disabled = true;

            try {
                const res = await fetch('/api/arca/credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cuit, clave, representada, api_key: apiKey })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("Credenciales guardadas con éxito", "success");
                    hideArcaCredsModal();
                    await fetchArcaCredentials();
                    startArcaSync(fullYear);
                } else {
                    showToast(data.message || "Error al guardar credenciales", "error");
                }
            } catch (e) {
                console.error("Error in modal save & sync:", e);
                showToast("Error de red al procesar credenciales", "error");
            } finally {
                btnModalSaveSyncArca.innerHTML = originalText;
                btnModalSaveSyncArca.disabled = false;
            }
        });
    }

    let arcaPollInterval = null;

    async function startArcaSync(fullYear = false) {
        if (!isArcaConfigured) {
            showArcaCredsModal();
            return;
        }

        try {
            const res = await fetch('/api/arca/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_year: fullYear })
            });
            const data = await res.json();

            if (!data.success) {
                if (data.configured === false) {
                    showArcaCredsModal();
                } else {
                    showToast(data.message, "error");
                }
                return;
            }

            showToast(data.message, "success");
            if (btnSyncArca) btnSyncArca.disabled = true;
            if (btnSyncArcaUpload) btnSyncArcaUpload.disabled = true;
            const bCompras = document.getElementById('btn-sync-arca-compras');
            if (bCompras) bCompras.disabled = true;
            const bCP = document.getElementById('btn-sync-arca-cp');
            if (bCP) bCP.disabled = true;

            if (arcaPollInterval) clearInterval(arcaPollInterval);
            arcaPollInterval = setInterval(pollArcaStatus, 2000);
        } catch (e) {
            console.error("Error starting ARCA sync:", e);
            showToast("Error al iniciar la sincronización con ARCA", "error");
        }
    }

    const arcaHeaderBadge = document.getElementById('arca-header-badge');
    const arcaHeaderIcon = document.getElementById('arca-header-icon');
    const arcaHeaderStatusText = document.getElementById('arca-header-status-text');

    async function pollArcaStatus() {
        try {
            const res = await fetch('/api/arca/status');
            const status = await res.json();

            if (arcaSyncStatusMsg) {
                arcaSyncStatusMsg.textContent = status.message || status.step;
            }

            const allBadges = document.querySelectorAll('.arca-header-badge');
            const allIcons = document.querySelectorAll('.arca-header-icon');
            const allTexts = document.querySelectorAll('.arca-header-status-text');

            if (status.running) {
                allBadges.forEach(b => {
                    b.style.display = 'inline-flex';
                    b.style.background = 'rgba(155, 89, 182, 0.2)';
                    b.style.color = '#9b59b6';
                    b.style.borderColor = 'rgba(155, 89, 182, 0.4)';
                });
                allIcons.forEach(i => i.className = 'arca-header-icon fa-solid fa-arrows-rotate fa-spin');
                allTexts.forEach(t => t.textContent = status.message || status.step);
            } else if (status.step === 'COMPLETED') {
                allBadges.forEach(b => {
                    b.style.display = 'inline-flex';
                    b.style.background = 'rgba(16, 185, 129, 0.2)';
                    b.style.color = '#34d399';
                    b.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                });
                allIcons.forEach(i => i.className = 'arca-header-icon fa-solid fa-circle-check');
                allTexts.forEach(t => t.textContent = 'ARCA Sincronizado');
            } else if (status.step === 'ERROR') {
                allBadges.forEach(b => {
                    b.style.display = 'inline-flex';
                    b.style.background = 'rgba(239, 68, 68, 0.2)';
                    b.style.color = '#f87171';
                    b.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                });
                allIcons.forEach(i => i.className = 'arca-header-icon fa-solid fa-triangle-exclamation');
                allTexts.forEach(t => t.textContent = 'Error en ARCA');
            }

            if (!status.running) {
                clearInterval(arcaPollInterval);
                arcaPollInterval = null;
                if (btnSyncArca) btnSyncArca.disabled = false;
                if (btnSyncArcaUpload) btnSyncArcaUpload.disabled = false;
                const bCompras = document.getElementById('btn-sync-arca-compras');
                if (bCompras) bCompras.disabled = false;
                const bCP = document.getElementById('btn-sync-arca-cp');
                if (bCP) bCP.disabled = false;

                if (status.step === 'COMPLETED') {
                    showToast(status.message, "success");
                    fetchSuppliers();
                } else if (status.step === 'ERROR') {
                    showToast(status.message || status.last_error, "error");
                }
            }
        } catch (e) {
            console.error("Error polling ARCA status:", e);
        }
    }

    const btnSyncArcaCompras = document.getElementById('btn-sync-arca-compras');
    const btnSyncArcaCP = document.getElementById('btn-sync-arca-cp');
    if (btnSyncArca) btnSyncArca.addEventListener('click', () => startArcaSync(false));
    if (btnSyncArcaUpload) btnSyncArcaUpload.addEventListener('click', () => startArcaSync(false));
    if (btnSyncArcaCompras) btnSyncArcaCompras.addEventListener('click', () => startArcaSync(false));
    if (btnSyncArcaCP) btnSyncArcaCP.addEventListener('click', () => startArcaSync(false));

    window.addEventListener('click', (e) => {
        if (e.target == arcaCredsModal) {
            hideArcaCredsModal();
        }
    });

    // --- Modal de Logs de ARCA ---
    const btnViewArcaLogs = document.getElementById('btn-view-arca-logs');
    const arcaLogsModal = document.getElementById('arca-logs-modal');
    const arcaLogsContent = document.getElementById('arca-logs-content');
    const btnRefreshArcaLogs = document.getElementById('btn-refresh-arca-logs');
    const closeArcaModalBtns = document.querySelectorAll('.close-arca-modal');

    async function fetchArcaLogs() {
        if (!arcaLogsContent) return;
        arcaLogsContent.textContent = 'Cargando registros...';
        try {
            const res = await fetch('/api/arca/logs');
            const data = await res.json();
            arcaLogsContent.textContent = data.logs || 'No se registraron entradas.';
            arcaLogsContent.scrollTop = arcaLogsContent.scrollHeight;
        } catch (e) {
            arcaLogsContent.textContent = `Error al cargar logs: ${e}`;
        }
    }

    if (btnViewArcaLogs) {
        btnViewArcaLogs.addEventListener('click', () => {
            fetchArcaLogs();
            if (arcaLogsModal) {
                arcaLogsModal.style.display = 'flex';
                arcaLogsModal.classList.add('fade-in');
            }
        });
    }

    if (btnRefreshArcaLogs) {
        btnRefreshArcaLogs.addEventListener('click', fetchArcaLogs);
    }

    closeArcaModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (arcaLogsModal) arcaLogsModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target == arcaLogsModal) {
            arcaLogsModal.style.display = 'none';
        }
    });

    // --- Historial Reciente de Procesamiento para el Usuario ---
    const userHistoryTableBody = document.getElementById('user-history-table-body');
    const btnClearUserHistory = document.getElementById('btn-clear-user-history');

    async function fetchUserHistory() {
        if (!userHistoryTableBody) return;
        try {
            const res = await fetch('/api/user_history');
            if (res.ok) {
                const history = await res.json();
                renderUserHistory(history);
            }
        } catch (e) {
            console.error("Error fetching user history:", e);
        }
    }

    function renderUserHistory(history) {
        if (!userHistoryTableBody) return;
        if (!history || history.length === 0) {
            userHistoryTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 1.5rem;">
                        Sin comprobantes procesados en esta sesión.
                    </td>
                </tr>`;
            return;
        }

        userHistoryTableBody.innerHTML = history.map(item => {
            let statusBadge = '';
            if (item.status_code === 'ok') {
                statusBadge = `<span class="badge badge-success" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;"><i class="fa-solid fa-check"></i> ${escapeHtml(item.status || 'Procesada')}</span>`;
            } else if (item.status_code === 'remito') {
                statusBadge = `<span class="badge" style="background: rgba(234, 179, 8, 0.2); color: #9a3412; border: 1px solid rgba(234, 179, 8, 0.4); display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;"><i class="fa-solid fa-receipt"></i> ${escapeHtml(item.status || 'Remito')}</span>`;
            } else {
                statusBadge = `<span class="badge badge-danger" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;"><i class="fa-solid fa-xmark"></i> ${escapeHtml(item.status || 'No Reconocida')}</span>`;
            }

            let iaBadge = '';
            if (item.used_ai) {
                iaBadge = `<span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #6b21a8; border: 1px solid rgba(168, 85, 247, 0.4); display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;"><i class="fa-solid fa-wand-magic-sparkles"></i> Rescatado con IA</span>`;
            } else {
                iaBadge = `<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #1d4ed8; border: 1px solid rgba(59, 130, 246, 0.4); display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;"><i class="fa-solid fa-bolt"></i> Directo (OCR/CAE)</span>`;
            }

            const timeFormatted = item.elapsed_seconds !== undefined ? `${item.elapsed_seconds}s` : '< 1s';

            return `
                <tr>
                    <td style="white-space: nowrap; color: var(--text-secondary); font-family: monospace;">${escapeHtml(item.time_str || item.timestamp || '-')}</td>
                    <td style="font-weight: 500; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.supplier || 'Desconocido')}</td>
                    <td style="color: var(--text-primary); font-family: monospace;">${escapeHtml(item.invoice_number || item.filename || '-')}</td>
                    <td>${iaBadge}</td>
                    <td style="color: var(--text-secondary); font-family: monospace;">${timeFormatted}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    if (btnClearUserHistory) {
        btnClearUserHistory.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/user_history', { method: 'DELETE' });
                if (res.ok) {
                    showToast("Historial limpiado correctamente");
                    renderUserHistory([]);
                }
            } catch (e) {
                console.error("Error clearing user history:", e);
                showToast("Error al limpiar historial", "error");
            }
        });
    }

    // --- Utility: Format Currency ---
    function formatCurrency(val) {
        if (val === null || val === undefined || isNaN(val)) return '$0';
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
    }

    function renderDiffTag(diff) {
        if (!diff || diff === 0) return `<span class="diff-tag zero">$0</span>`;
        if (diff > 0) return `<span class="diff-tag positive">+${formatCurrency(diff)}</span>`;
        return `<span class="diff-tag negative">${formatCurrency(diff)}</span>`;
    }

    // Chart instances
    let chartRecaudacionInst = null;
    let chartMediosPagoInst = null;
    let chartEstacionamientoInst = null;
    let chartGananciaNetaInst = null;
    let chartEmpresaEstructuraInst = null;
    let chartEmpresaCubiertosInst = null;

    // Helper: espera a que Chart.js esté disponible (carga con defer)
    function waitForChart() {
        return new Promise((resolve, reject) => {
            if (typeof Chart !== 'undefined') { resolve(); return; }
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (typeof Chart !== 'undefined') {
                    clearInterval(interval);
                    resolve();
                } else if (attempts >= 80) {
                    clearInterval(interval);
                    // Intentar cargar Chart.js dinámicamente como fallback
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
                    s.onload = () => resolve();
                    s.onerror = () => reject(new Error('Chart.js no se pudo cargar'));
                    document.body.appendChild(s);
                }
            }, 100);
        });
    }

    // 1. Cuentas por Pagar
    async function fetchCuentasPorPagar() {
        try {
            const url = '/api/cuentas_por_pagar' + (currentSelectedMonth ? '?mes=' + currentSelectedMonth : '');
            const res = await fetch(url);
            const data = await res.json();

            document.getElementById('cp-stat-facturado').textContent = formatCurrency(data.resumen.total_facturado);
            document.getElementById('cp-stat-pagado').textContent = formatCurrency(data.resumen.total_pagado);
            document.getElementById('cp-stat-pendiente').textContent = formatCurrency(data.resumen.total_pendiente);

            const pendientes = data.cuentas.filter(c => c.estado !== 'Pagado');
            const tbody = document.getElementById('tbl-cuentas-pagar-body');
            if (!pendientes || pendientes.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No hay facturas pendientes en cuentas por pagar</td></tr>`;
                return;
            }

            tbody.innerHTML = pendientes.map(c => {
                let badgeClass = 'badge-pending';
                if (c.estado === 'Pagado') badgeClass = 'badge-paid';
                if (c.estado === 'Pagado Parcial') badgeClass = 'badge-partial';

                const actionBtn = c.estado !== 'Pagado' ? `
                    <select class="form-control" style="font-size: 0.78rem; padding: 3px 6px; height: 30px; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--border-color);"
                        onchange="if(this.value) registrarPagoProveedor(${c.id}, this.value)">
                        <option value="" disabled selected style="color: var(--text-secondary);">Pagar con...</option>
                        <option value="Efectivo" style="color: #10b981; font-weight: 700;">🟩 Efectivo</option>
                        <option value="Galicia" style="color: #ea580c; font-weight: 700;">🟧 Galicia</option>
                        <option value="Mercado Pago" style="color: #2563eb; font-weight: 700;">🟦 Mercado Pago</option>
                        <option value="Tarjeta crédito" style="color: #7c3aed; font-weight: 700;">🟪 Tarjeta crédito</option>
                    </select>
                ` : `<span style="color: #047857; font-weight: 700;"><i class="fa-solid fa-check"></i> Pagado</span>`;

                return `
                    <tr>
                        <td><strong>${escapeHtml(c.proveedor_nombre)}</strong></td>
                        <td style="font-family: monospace;">${escapeHtml(c.factura_numero)}</td>
                        <td>${escapeHtml(c.fecha || '-')}</td>
                        <td><span class="badge-status ${badgeClass}">${escapeHtml(c.estado)}</span></td>
                        <td>${escapeHtml(c.medio_pago || '-')}</td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            console.error("Error cargando cuentas por pagar:", e);
        }
    }

    window.registrarPagoProveedor = async function (id, medio) {
        try {
            const res = await fetch('/api/cuentas_por_pagar/registrar_pago', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, medio_pago: medio })
            });
            const data = await res.json();
            if (data.success) {
                showToast("Pago registrado correctamente");
                fetchCuentasPorPagar();
            } else {
                showToast(data.error || "Error al registrar pago", "error");
            }
        } catch (e) {
            showToast("Error de red", "error");
        }
    };

    // 2. Recaudación & Conciliación Maxirest
    let cachedRecaudacionRecords = [];

    async function fetchRecaudacion() {
        try {
            const url = '/api/recaudacion' + (currentSelectedMonth ? '?mes=' + currentSelectedMonth : '');
            const res = await fetch(url);
            const data = await res.json();
            cachedRecaudacionRecords = data || [];

            const tbody = document.getElementById('tbl-recaudacion-body');
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; color: var(--text-secondary);">No hay registros de recaudación</td></tr>`;
                return;
            }

            // KPI Cards Totales para Alivios & Conciliación
            const totRec = data.reduce((s, r) => s + (r.total_diario || 0), 0);
            const totMP = data.reduce((s, r) => s + (r.mp_real || 0), 0);
            const totNave = data.reduce((s, r) => s + (r.nave_real || 0), 0);
            const totPY = data.reduce((s, r) => s + (r.py_real || 0), 0);
            const totBanco = data.reduce((s, r) => s + (r.banco_real || 0), 0);
            const totAlivios = data.reduce((s, r) => s + (r.efectivo_real || r.efectivo_cub || 0), 0);

            if (document.getElementById('rec-stat-total')) document.getElementById('rec-stat-total').textContent = formatCurrency(totRec);
            if (document.getElementById('rec-stat-mp')) document.getElementById('rec-stat-mp').textContent = formatCurrency(totMP);
            if (document.getElementById('rec-stat-nave')) document.getElementById('rec-stat-nave').textContent = formatCurrency(totNave);
            if (document.getElementById('rec-stat-py')) document.getElementById('rec-stat-py').textContent = formatCurrency(totPY);
            if (document.getElementById('rec-stat-banco')) document.getElementById('rec-stat-banco').textContent = formatCurrency(totBanco);
            if (document.getElementById('rec-stat-alivios')) document.getElementById('rec-stat-alivios').textContent = formatCurrency(totAlivios);

            tbody.innerHTML = data.map((r, idx) => {
                let lotesText = '';
                if (r.lotes_json) {
                    try {
                        const parsed = typeof r.lotes_json === 'string' ? JSON.parse(r.lotes_json) : r.lotes_json;
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            lotesText = parsed.map((l, i) => `L${i + 1}: ${formatCurrency(l)}`).join(' | ');
                        }
                    } catch (e) { }
                }
                const alivioLabel = lotesText ?
                    `<span class="badge" style="background: rgba(16,185,129,0.15); color: #047857; font-weight:700;" title="${lotesText}">${formatCurrency(r.efectivo_real || 0)} <small>(${lotesText.substring(0, 30)}${lotesText.length > 30 ? '...' : ''})</small></span>` :
                    `<span class="badge" style="background: rgba(59,130,246,0.15); color: #1d4ed8; font-weight:700;">${formatCurrency(r.efectivo_real || r.efectivo_cub || 0)}</span>`;

                const feriadoBadge = r.es_feriado == 1 ? ' <span class="badge" style="background:#fef3c7; color:#d97706; font-size:0.7rem; padding:0.1rem 0.35rem; font-weight:700; border: 1px solid rgba(217, 119, 6, 0.3);"><i class="fa-solid fa-umbrella-beach"></i> Feriado</span>' : '';

                return `
                    <tr>
                        <td><strong>${escapeHtml(r.fecha)}</strong><br><small style="color:var(--text-secondary);">${escapeHtml(r.dia_nombre || '')}</small>${feriadoBadge}</td>
                        <td>${alivioLabel}</td>
                        <td><strong style="color: #a855f7;">${r.cubiertos || 0}</strong></td>
                        <td>${formatCurrency(r.nave_real)} <small style="color:var(--text-secondary);">(${formatCurrency(r.nave_maxi)})</small><br>${renderDiffTag(r.diff_nave)}</td>
                        <td>${formatCurrency(r.efectivo_real)} <small style="color:var(--text-secondary);">(${formatCurrency(r.efectivo_maxi)})</small><br>${renderDiffTag(r.diff_efectivo)}</td>
                        <td>${formatCurrency(r.py_real)} <small style="color:var(--text-secondary);">(${formatCurrency(r.py_maxi)})</small><br>${renderDiffTag(r.diff_py)}</td>
                        <td>${formatCurrency(r.mp_real)} <small style="color:var(--text-secondary);">(${formatCurrency(r.mp_maxi)})</small><br>${renderDiffTag(r.diff_mp)}</td>
                        <td>${formatCurrency(r.banco_real)} <small style="color:var(--text-secondary);">(${formatCurrency(r.banco_maxi)})</small><br>${renderDiffTag(r.diff_banco)}</td>
                        <td><strong>${formatCurrency(r.total_diario)}</strong></td>
                        <td>${renderDiffTag(r.diferencia_total)}</td>
                        <td>${formatCurrency(r.proyeccion_recaudacion || 0)}</td>
                        <td>${escapeHtml(r.comentario || '')} ${r.diff_proyeccion ? '<br>' + renderDiffTag(r.diff_proyeccion) : ''}</td>
                        <td style="display: flex; gap: 4px;">
                            <button class="btn btn-secondary btn-sm" onclick="editarRecaudacion('${r.fecha}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn btn-secondary btn-sm" onclick="eliminarRecaudacion('${r.fecha}')" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Charts
            const labels = data.map(r => r.fecha.substring(5));
            const totales = data.map(r => r.total_diario);
            const proyecciones = data.map(r => r.proyeccion_recaudacion || r.total_diario * 0.9);

            await waitForChart();
            if (chartRecaudacionInst) chartRecaudacionInst.destroy();
            const ctx1 = document.getElementById('chartRecaudacion').getContext('2d');
            chartRecaudacionInst = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Recaudación Real', data: totales, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 },
                        { label: 'Proyección', data: proyecciones, borderColor: '#8b5cf6', borderDash: [5, 5], fill: false }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#64748b' } } } }
            });

            // Pie chart medios de pago
            if (chartMediosPagoInst) chartMediosPagoInst.destroy();
            const ctx2 = document.getElementById('chartMediosPago').getContext('2d');
            chartMediosPagoInst = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['NAVE', 'Efectivo', 'PedidosYa', 'MercadoPago', 'Banco'],
                    datasets: [{
                        data: [totNave, totAlivios, totPY, totMP, totBanco],
                        backgroundColor: ['#8b5cf6', '#10b981', '#ef4444', '#3b82f6', '#f59e0b']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } } }
            });

            // Cargar Retiros de Recaudación
            fetchRetirosRecaudacion();

        } catch (e) {
            console.error("Error cargando recaudación:", e);
        }
    }

    // 3. Estacionamiento Diario
    async function fetchEstacionamiento() {
        try {
            const url = '/api/estacionamiento' + (currentSelectedMonth ? '?mes=' + currentSelectedMonth : '');
            const res = await fetch(url);
            const data = await res.json();

            document.getElementById('est-stat-cash').textContent = formatCurrency(data.totales.total_cash);
            document.getElementById('est-stat-mp').textContent = formatCurrency(data.totales.total_mp);
            document.getElementById('est-stat-total').textContent = formatCurrency(data.totales.total_ganancia);
            if (document.getElementById('est-stat-diff')) {
                document.getElementById('est-stat-diff').textContent = formatCurrency(data.totales.total_diferencia);
                document.getElementById('est-stat-diff').style.color = data.totales.total_diferencia < 0 ? '#ef4444' : (data.totales.total_diferencia > 0 ? '#34d399' : '');
            }
            document.getElementById('est-stat-gasto').textContent = formatCurrency(data.totales.gasto_operativo);
            if (document.getElementById('est-stat-neta')) {
                document.getElementById('est-stat-neta').textContent = formatCurrency(data.totales.ganancia_neta);
                document.getElementById('est-stat-neta').style.color = data.totales.ganancia_neta >= 0 ? '#34d399' : '#f87171';
            }

            const tbody = document.getElementById('tbl-estacionamiento-body');
            const todayStr = new Date().toISOString().split('T')[0];
            const daysMap = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            const dayNameStr = daysMap[new Date().getDay()];

            let inlineRowHtml = `
                <tr class="tr-inline-add" id="row-inline-add-est">
                    <td><input type="date" class="form-input-inline" id="est-in-fecha" value="${todayStr}"></td>
                    <td><input type="text" class="form-input-inline" id="est-in-dia" value="${dayNameStr}" style="width: 100px;"></td>
                    <td><input type="number" class="form-input-inline" id="est-in-tc" placeholder="0"></td>
                    <td><input type="number" class="form-input-inline" id="est-in-cash" placeholder="0"></td>
                    <td><input type="number" class="form-input-inline" id="est-in-mp" placeholder="0"></td>
                    <td><span id="est-in-total-val" style="font-weight:700; color:#10b981;">$0</span></td>
                    <td><span id="est-in-diff-val" class="diff-tag zero">$0</span></td>
                    <td><input type="text" class="form-input-inline" id="est-in-comentario" placeholder="Comentario u observación..."></td>
                    <td>
                        <button class="btn btn-primary btn-sm" id="btn-save-inline-est" title="Guardar nuevo día">
                            <i class="fa-solid fa-floppy-disk"></i> Guardar
                        </button>
                    </td>
                </tr>
            `;

            let recordsHtml = '';
            if (data.registros && data.registros.length > 0) {
                recordsHtml = data.registros.map(r => `
                    <tr>
                        <td>${escapeHtml(r.fecha)}</td>
                        <td>${escapeHtml(r.dia_nombre)}</td>
                        <td>${formatCurrency(r.caja_ticketcontrol)}</td>
                        <td>${formatCurrency(r.controlado_cash)}</td>
                        <td>${formatCurrency(r.controlado_mp)}</td>
                        <td><strong>${formatCurrency(r.total)}</strong></td>
                        <td>${renderDiffTag(r.diferencia)}</td>
                        <td>${escapeHtml(r.comentario || '')}</td>
                        <td style="display: flex; gap: 4px;">
                            <button class="btn btn-secondary btn-sm" onclick="editarDiaEstacionamiento('${r.fecha}', '${escapeHtml(r.dia_nombre)}', ${r.caja_ticketcontrol}, ${r.controlado_cash}, ${r.controlado_mp}, '${escapeHtml(r.comentario || '').replace(/'/g, "\\'")}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn btn-secondary btn-sm" onclick="eliminarDiaEstacionamiento('${r.fecha}')" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
                        </td>
                    </tr>
                `).join('');
            } else {
                recordsHtml = `<tr><td colspan="9" style="text-align:center; color: var(--text-secondary);">No hay registros anteriores de estacionamiento</td></tr>`;
            }

            tbody.innerHTML = recordsHtml + inlineRowHtml;

            // Event listeners para cálculo en línea
            ['est-in-tc', 'est-in-cash', 'est-in-mp'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', updateInlineEstCalculations);
            });

            // Event listener para actualizar el día automáticamente al cambiar la fecha
            const inputFechaEst = document.getElementById('est-in-fecha');
            if (inputFechaEst) {
                inputFechaEst.addEventListener('change', updateEstacionamientoDiaAuto);
                inputFechaEst.addEventListener('input', updateEstacionamientoDiaAuto);
                updateEstacionamientoDiaAuto();
            }

            // Event listener guardar en línea
            const btnSaveInline = document.getElementById('btn-save-inline-est');
            if (btnSaveInline) {
                btnSaveInline.addEventListener('click', saveInlineEstacionamiento);
            }

            // Event listener para scroll a la fila de carga desde el botón del encabezado de la tarjeta
            const btnToggleInlineEst = document.getElementById('btn-toggle-inline-est');
            if (btnToggleInlineEst) {
                btnToggleInlineEst.addEventListener('click', () => {
                    const inlineRow = document.getElementById('row-inline-add-est');
                    if (inlineRow) {
                        inlineRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const inputTc = document.getElementById('est-in-tc');
                        if (inputTc) inputTc.focus();
                    }
                });
            }

            // Chart
            const labelsEst = data.registros ? data.registros.map(r => r.fecha.substring(5)) : [];
            const totalesEst = data.registros ? data.registros.map(r => r.total) : [];

            await waitForChart();
            if (chartEstacionamientoInst) chartEstacionamientoInst.destroy();
            const ctx = document.getElementById('chartEstacionamiento').getContext('2d');
            chartEstacionamientoInst = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labelsEst,
                    datasets: [{ label: 'Total Diario ($)', data: totalesEst, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#64748b' } } } }
            });

            // Cargar gastos fijos independientes del Estacionamiento
            fetchEstacionamientoGastos();
        } catch (e) {
            console.error("Error cargando estacionamiento:", e);
        }
    }

    function updateInlineEstCalculations() {
        const tc = parseFloat(document.getElementById('est-in-tc')?.value || 0);
        const cash = parseFloat(document.getElementById('est-in-cash')?.value || 0);
        const mp = parseFloat(document.getElementById('est-in-mp')?.value || 0);
        const total = cash + mp;
        const diff = total - tc;

        const totalEl = document.getElementById('est-in-total-val');
        if (totalEl) totalEl.textContent = formatCurrency(total);

        const diffEl = document.getElementById('est-in-diff-val');
        if (diffEl) diffEl.innerHTML = renderDiffTag(diff);
    }

    function updateEstacionamientoDiaAuto() {
        const fechaEl = document.getElementById('est-in-fecha');
        const diaEl = document.getElementById('est-in-dia');
        if (!fechaEl || !diaEl || !fechaEl.value) return;

        const parts = fechaEl.value.split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const dateObj = new Date(year, month, day);
            if (!isNaN(dateObj.getTime())) {
                const daysMap = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                diaEl.value = daysMap[dateObj.getDay()];
            }
        }
    }

    async function saveInlineEstacionamiento() {
        const fecha = document.getElementById('est-in-fecha')?.value;
        const diaNombre = document.getElementById('est-in-dia')?.value || '';
        const tc = parseFloat(document.getElementById('est-in-tc')?.value || 0);
        const cash = parseFloat(document.getElementById('est-in-cash')?.value || 0);
        const mp = parseFloat(document.getElementById('est-in-mp')?.value || 0);
        const comentario = document.getElementById('est-in-comentario')?.value || '';

        if (!fecha) {
            showToast("Por favor selecciona una fecha", "warning");
            return;
        }

        try {
            const res = await fetch('/api/estacionamiento', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fecha,
                    dia_nombre: diaNombre,
                    caja_ticketcontrol: tc,
                    controlado_cash: cash,
                    controlado_mp: mp,
                    comentario
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast("Día de estacionamiento guardado correctamente");
                fetchEstacionamiento();
            } else {
                showToast(data.error || "Error al guardar", "error");
            }
        } catch (e) {
            showToast("Error de conexión", "error");
        }
    }

    // Gestor independiente de Gastos Fijos del Estacionamiento
    async function fetchEstacionamientoGastos() {
        try {
            const res = await fetch('/api/estacionamiento/gastos');
            const data = await res.json();

            const tbody = document.getElementById('tbl-est-gastos-body');
            if (!data.gastos || data.gastos.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-secondary);">No hay gastos fijos registrados para estacionamiento</td></tr>`;
                return;
            }

            tbody.innerHTML = data.gastos.map(g => `
                <tr>
                    <td><strong>${escapeHtml(g.concepto)}</strong></td>
                    <td style="color: #f87171; font-weight:600;">${formatCurrency(g.monto)}</td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="eliminarGastoEstacionamiento('${escapeHtml(g.concepto)}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `).join('') + `
                <tr style="background: rgba(255,255,255,0.04); font-weight:bold;">
                    <td>TOTAL GASTOS ESTACIONAMIENTO</td>
                    <td style="color:#f87171; font-size:1rem;">${formatCurrency(data.total)}</td>
                    <td></td>
                </tr>
            `;
        } catch (e) {
            console.error("Error cargando gastos fijos de estacionamiento:", e);
        }
    }

    // Agregar nuevo gasto fijo al estacionamiento
    const btnAddEstGasto = document.getElementById('btn-add-est-gasto');
    if (btnAddEstGasto) {
        btnAddEstGasto.addEventListener('click', async () => {
            const concepto = document.getElementById('est-gasto-concepto')?.value?.trim();
            const monto = parseFloat(document.getElementById('est-gasto-monto')?.value || 0);

            if (!concepto || monto <= 0) {
                showToast("Ingresa un concepto y monto válido", "warning");
                return;
            }

            try {
                const res = await fetch('/api/estacionamiento/gastos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ concepto, monto })
                });
                if (res.ok) {
                    showToast("Gasto fijo de estacionamiento guardado");
                    document.getElementById('est-gasto-concepto').value = '';
                    document.getElementById('est-gasto-monto').value = '';
                    fetchEstacionamiento();
                }
            } catch (e) {
                showToast("Error guardando gasto de estacionamiento", "error");
            }
        });
    }

    window.eliminarGastoEstacionamiento = async function (concepto) {
        if (!confirm(`¿Eliminar el gasto '${concepto}' del estacionamiento?`)) return;
        try {
            const res = await fetch('/api/estacionamiento/gastos', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concepto })
            });
            if (res.ok) {
                showToast("Gasto eliminado");
                fetchEstacionamiento();
            }
        } catch (e) {
            showToast("Error eliminando gasto", "error");
        }
    };

    // 4. Caja Chica / Alivios & Arqueo
    async function fetchCajaChica() {
        try {
            const url = '/api/caja_chica/movimientos' + (currentSelectedMonth ? '?mes=' + currentSelectedMonth : '');
            const res = await fetch(url);
            const data = await res.json();

            document.getElementById('cc-stat-ingresado').textContent = formatCurrency(data.resumen.ingresado_acumulado);
            document.getElementById('cc-stat-gasto').textContent = formatCurrency(data.resumen.gasto_total);
            document.getElementById('cc-stat-fondo').textContent = formatCurrency(data.resumen.fondo_total);
            document.getElementById('cc-stat-pct').textContent = `${data.resumen.porcentaje_caja}%`;

            const tbody = document.getElementById('tbl-caja-chica-body');
            if (!data.movimientos || data.movimientos.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No hay movimientos registrados</td></tr>`;
                return;
            }

            tbody.innerHTML = data.movimientos.map(m => `
                <tr>
                    <td>${escapeHtml(m.fecha)}</td>
                    <td style="color: #f87171;">${m.monto_retirado > 0 ? '-' + formatCurrency(m.monto_retirado) : '-'}</td>
                    <td style="color: #047857;">${m.monto_ingresado > 0 ? '+' + formatCurrency(m.monto_ingresado) : '-'}</td>
                    <td>${escapeHtml(m.motivo)}</td>
                    <td>${escapeHtml(m.responsable || 'Admin')}</td>
                    <td><span class="badge" style="background: rgba(0,0,0,0.04); color: var(--text-primary); border: 1px solid var(--border-color);">${escapeHtml(m.categoria || 'General')}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="eliminarMovimientoCajaChica(${m.id})" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
                    </td>
                </tr>
            `).join('');

            // Cargar arqueo guardado
            fetchArqueoGuardado();
        } catch (e) {
            console.error("Error cargando caja chica:", e);
        }
    }

    window.eliminarMovimientoCajaChica = async function (id) {
        if (!confirm("¿Deseas eliminar este movimiento de caja chica?")) return;
        try {
            const res = await fetch(`/api/caja_chica/movimientos?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast("Movimiento eliminado");
                fetchCajaChica();
            } else {
                showToast("Error eliminando movimiento", "error");
            }
        } catch (e) {
            showToast("Error de conexión", "error");
        }
    };

    function calculateArqueo() {
        const b20k = parseInt(document.getElementById('b-20000')?.value || 0) * 20000;
        const b10k = parseInt(document.getElementById('b-10000')?.value || 0) * 10000;
        const b2k = parseInt(document.getElementById('b-2000')?.value || 0) * 2000;
        const b1k = parseInt(document.getElementById('b-1000')?.value || 0) * 1000;
        const b500 = parseInt(document.getElementById('b-500')?.value || 0) * 500;
        const b200 = parseInt(document.getElementById('b-200')?.value || 0) * 200;
        const b100 = parseInt(document.getElementById('b-100')?.value || 0) * 100;
        const b50 = parseInt(document.getElementById('b-50')?.value || 0) * 50;
        const b20 = parseInt(document.getElementById('b-20')?.value || 0) * 20;

        if (document.getElementById('sub-20000')) document.getElementById('sub-20000').textContent = formatCurrency(b20k);
        if (document.getElementById('sub-10000')) document.getElementById('sub-10000').textContent = formatCurrency(b10k);
        if (document.getElementById('sub-2000')) document.getElementById('sub-2000').textContent = formatCurrency(b2k);
        if (document.getElementById('sub-1000')) document.getElementById('sub-1000').textContent = formatCurrency(b1k);
        if (document.getElementById('sub-500')) document.getElementById('sub-500').textContent = formatCurrency(b500);
        if (document.getElementById('sub-200')) document.getElementById('sub-200').textContent = formatCurrency(b200);
        if (document.getElementById('sub-100')) document.getElementById('sub-100').textContent = formatCurrency(b100);
        if (document.getElementById('sub-50')) document.getElementById('sub-50').textContent = formatCurrency(b50);
        if (document.getElementById('sub-20')) document.getElementById('sub-20').textContent = formatCurrency(b20);

        const total = b20k + b10k + b2k + b1k + b500 + b200 + b100 + b50 + b20;
        if (document.getElementById('arqueo-total-contado')) document.getElementById('arqueo-total-contado').textContent = formatCurrency(total);
    }

    // Navegación por tecla Enter entre recuadros de denominación (20000 -> 10000 -> 2000 ...)
    const billeteSequence = ['b-20000', 'b-10000', 'b-2000', 'b-1000', 'b-500', 'b-200', 'b-100', 'b-50', 'b-20'];
    billeteSequence.forEach((id, idx) => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('input', calculateArqueo);

        // Selección automática del valor al enfocar para sobreescribir rápido
        input.addEventListener('focus', () => {
            try { input.select(); } catch (e) { }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (idx < billeteSequence.length - 1) {
                    const nextInput = document.getElementById(billeteSequence[idx + 1]);
                    if (nextInput) {
                        nextInput.focus();
                        try { nextInput.select(); } catch (err) { }
                    }
                } else {
                    // Al presionar Enter en $20, guarda automáticamente el arqueo
                    const btnSave = document.getElementById('btn-guardar-arqueo');
                    if (btnSave) btnSave.click();
                }
            }
        });
    });

    async function fetchArqueoGuardado() {
        try {
            const res = await fetch('/api/caja_chica/arqueo');
            const data = await res.json();
            if (data.id) {
                if (document.getElementById('b-20000')) document.getElementById('b-20000').value = data.b_20000 || 0;
                if (document.getElementById('b-10000')) document.getElementById('b-10000').value = data.b_10000 || 0;
                if (document.getElementById('b-2000')) document.getElementById('b-2000').value = data.b_2000 || 0;
                if (document.getElementById('b-1000')) document.getElementById('b-1000').value = data.b_1000 || 0;
                if (document.getElementById('b-500')) document.getElementById('b-500').value = data.b_500 || 0;
                if (document.getElementById('b-200')) document.getElementById('b-200').value = data.b_200 || 0;
                if (document.getElementById('b-100')) document.getElementById('b-100').value = data.b_100 || 0;
                if (document.getElementById('b-50')) document.getElementById('b-50').value = data.b_50 || 0;
                if (document.getElementById('b-20')) document.getElementById('b-20').value = data.b_20 || 0;
                calculateArqueo();
            }
        } catch (e) { }
    }

    window.limpiarBilletes = function () {
        if (!confirm("¿Deseas limpiar todos los campos del arqueo?")) return;
        const denominaciones = ['20000', '10000', '2000', '1000', '500', '200', '100', '50', '20'];
        denominaciones.forEach(den => {
            const input = document.getElementById('b-' + den);
            if (input) input.value = '';
        });
        calculateArqueo();

        // Opcional: limpiar también en la base de datos si así lo desean,
        // pero por ahora solo borraremos los campos visualmente.
    };

    const btnNuevoMovCaja = document.getElementById('btn-nuevo-movimiento-caja');
    const modalCaja = document.getElementById('modal-caja-chica');
    const btnCloseCaja = document.getElementById('btn-close-modal-caja');
    const btnCancelCaja = document.getElementById('btn-cancel-modal-caja');
    const btnSaveCaja = document.getElementById('btn-save-modal-caja');

    if (btnNuevoMovCaja && modalCaja) {
        const closeModal = () => modalCaja.classList.remove('show');

        btnNuevoMovCaja.addEventListener('click', async () => {
            // Retrieve last responsible from SQLite via API
            let lastResponsable = '';
            try {
                const resConfig = await fetch('/api/configuraciones/caja_responsable');
                const dataConfig = await resConfig.json();
                if (dataConfig.valor) lastResponsable = dataConfig.valor;
            } catch (e) { }

            // Reset fields
            document.getElementById('modal-caja-tipo').value = 'E';
            document.getElementById('modal-caja-monto').value = '';
            document.getElementById('modal-caja-motivo').value = '';
            document.getElementById('modal-caja-responsable').value = lastResponsable;
            if (document.getElementById('modal-caja-categoria')) {
                document.getElementById('modal-caja-categoria').value = 'General';
            }

            modalCaja.classList.add('show');
        });

        if (btnCloseCaja) btnCloseCaja.addEventListener('click', closeModal);
        if (btnCancelCaja) btnCancelCaja.addEventListener('click', closeModal);

        if (btnSaveCaja) {
            btnSaveCaja.addEventListener('click', async () => {
                const tipo = document.getElementById('modal-caja-tipo').value;
                const montoStr = document.getElementById('modal-caja-monto').value;
                const motivo = document.getElementById('modal-caja-motivo').value || 'Gasto diario';
                const responsable = document.getElementById('modal-caja-responsable').value || 'Tomás';
                const categoria = document.getElementById('modal-caja-categoria') ? document.getElementById('modal-caja-categoria').value : 'General';

                // Save responsible to SQLite via API
                fetch('/api/configuraciones/caja_responsable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ valor: responsable })
                }).catch(() => { });

                const monto = parseFloat(montoStr);
                if (isNaN(monto) || monto <= 0) return showToast("Monto inválido", "error");

                const payload = {
                    monto_retirado: tipo === 'E' ? monto : 0,
                    monto_ingresado: tipo === 'I' ? monto : 0,
                    motivo,
                    responsable,
                    categoria
                };

                try {
                    const res = await fetch('/api/caja_chica/movimientos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        showToast("Movimiento de caja registrado con éxito");
                        closeModal();
                        fetchCajaChica();
                    } else {
                        showToast("Error al registrar movimiento", "error");
                    }
                } catch (error) {
                    console.error("Error al registrar movimiento:", error);
                    showToast("Error de conexión al registrar", "error");
                }
            });
        }
    }

    // 5. Gastos Fijos & Ganancia Neta — Editable por mes
    const METODOS_PAGO = [
        { key: 'Efectivo', label: 'Efectivo', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)' },
        { key: 'Galicia', label: 'Galicia', color: '#ea580c', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)' },
        { key: 'Mercado Pago', label: 'Mercado Pago', color: '#2563eb', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)' },
        { key: 'Tarjeta crédito', label: 'Tarjeta crédito', color: '#7c3aed', bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.4)' }
    ];

    async function fetchGastosFijos() {
        try {
            const mesParam = currentSelectedMonth ? '?mes=' + currentSelectedMonth : '';
            const resUrl = '/api/dashboard/resumen' + (currentSelectedMonth ? '?mes=' + currentSelectedMonth : '');
            const gfUrl = '/api/gastos_fijos' + mesParam;
            const [resResumen, resGastos] = await Promise.all([
                fetch(resUrl).then(r => r.json()),
                fetch(gfUrl).then(r => r.json())
            ]);

            document.getElementById('gf-stat-bruta').textContent = formatCurrency(resResumen.ganancia_bruta);
            document.getElementById('gf-stat-caja').textContent = formatCurrency(resResumen.gasto_caja);
            document.getElementById('gf-stat-fijo').textContent = formatCurrency(resResumen.gasto_fijo);
            document.getElementById('gf-stat-neta').textContent = formatCurrency(resResumen.ganancia_neta);

            renderGastosFijosTable(resGastos.gastos || [], resGastos.total || 0);

            // Chart Ganancia Neta
            await waitForChart();
            if (chartGananciaNetaInst) chartGananciaNetaInst.destroy();
            const ctx = document.getElementById('chartGananciaNeta').getContext('2d');
            const monthLabel = currentSelectedMonth ? `Mes (${currentSelectedMonth})` : 'Período Activo';
            chartGananciaNetaInst = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: [monthLabel],
                    datasets: [{
                        label: 'Ganancia Neta ($)',
                        data: [resResumen.ganancia_neta],
                        backgroundColor: [resResumen.ganancia_neta >= 0 ? '#34d399' : '#f87171']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        } catch (e) {
            console.error("Error cargando gastos fijos:", e);
        }
    }

    function renderGastosFijosTable(gastos, total) {
        const tbody = document.getElementById('tbl-gastos-fijos-body');
        if (!tbody) return;

        if (!gastos || gastos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-secondary); padding: 2rem;">
                No hay gastos fijos para este mes. Usá "Copiar Mes Anterior" o "+ Agregar Concepto".
            </td></tr>`;
            return;
        }

        tbody.innerHTML = gastos.map(g => `
            <tr data-gf-id="${g.id}">
                <td>
                    <strong>${escapeHtml(g.concepto)}</strong>
                </td>
                <td>
                    <strong style="color: #ef4444;">${formatCurrency(g.monto_mensual)}</strong>
                </td>
                <td style="text-align: center; display: flex; gap: 4px; justify-content: center;">
                    <button class="btn btn-secondary btn-sm" onclick="abrirModalGastoFijo(${g.id}, '${escapeHtml(g.concepto).replace(/'/g, "\\'")}', ${g.monto_mensual})" title="Editar concepto">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="eliminarGastoFijo(${g.id})" title="Eliminar este concepto">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `).join('') + `
            <tr style="background: rgba(255,255,255,0.05); font-weight: bold; border-top: 2px solid rgba(255,255,255,0.1);">
                <td>TOTAL GASTOS FIJOS</td>
                <td style="color: #ef4444;">${formatCurrency(total)}</td>
                <td></td>
            </tr>
        `;
    }

    // Modal Gestor de Gasto Fijo
    const modalGastoFijo = document.getElementById('modal-gasto-fijo');
    const btnCloseModalGF = document.getElementById('btn-close-modal-gf');
    const btnCancelModalGF = document.getElementById('btn-cancel-modal-gf');
    const btnSaveModalGF = document.getElementById('btn-save-modal-gf');

    window.abrirModalGastoFijo = function (id = null, concepto = '', monto = 0) {
        if (!modalGastoFijo) return;

        document.getElementById('modal-gf-id').value = id || '';
        document.getElementById('modal-gf-concepto').value = concepto || '';
        document.getElementById('modal-gf-monto').value = monto || '';

        const titleEl = document.getElementById('modal-gf-title');
        if (titleEl) {
            titleEl.innerHTML = id ?
                '<i class="fa-solid fa-pen-to-square" style="color: #3b82f6;"></i> Editar Concepto de Gasto Fijo' :
                '<i class="fa-solid fa-receipt" style="color: #3b82f6;"></i> Agregar Concepto de Gasto Fijo';
        }

        modalGastoFijo.style.display = 'flex';
        setTimeout(() => {
            document.getElementById('modal-gf-concepto')?.focus();
        }, 50);
    };

    function closeModalGastoFijo() {
        if (modalGastoFijo) modalGastoFijo.style.display = 'none';
    }

    if (btnCloseModalGF) btnCloseModalGF.addEventListener('click', closeModalGastoFijo);
    if (btnCancelModalGF) btnCancelModalGF.addEventListener('click', closeModalGastoFijo);

    if (btnSaveModalGF) {
        btnSaveModalGF.addEventListener('click', async () => {
            const id = document.getElementById('modal-gf-id').value;
            const concepto = document.getElementById('modal-gf-concepto').value.trim();
            const montoStr = document.getElementById('modal-gf-monto').value;
            const monto = parseFloat(montoStr) || 0;

            if (!concepto) {
                showToast("Por favor ingresa un nombre para el concepto", "error");
                return;
            }

            const payload = {
                action: 'upsert',
                concepto,
                monto_mensual: monto,
                mes: currentSelectedMonth
            };
            if (id) payload.id = parseInt(id);

            try {
                const res = await fetch('/api/gastos_fijos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    showToast(id ? "Concepto de gasto fijo actualizado" : "Concepto de gasto fijo agregado");
                    closeModalGastoFijo();
                    fetchGastosFijos();
                } else {
                    showToast(data.error || "Error al guardar el concepto", "error");
                }
            } catch (e) {
                showToast("Error de conexión al guardar el concepto", "error");
            }
        });
    }

    window.eliminarGastoFijo = async function (id) {
        if (!confirm('¿Eliminar este concepto de gastos fijos?')) return;
        try {
            await fetch('/api/gastos_fijos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', id })
            });
            showToast('Concepto eliminado');
            fetchGastosFijos();
        } catch (e) { showToast('Error al eliminar', 'error'); }
    };

    // Botón Agregar Concepto (Abre el Modal)
    const btnAgregarGF = document.getElementById('btn-agregar-gasto-fijo');
    if (btnAgregarGF) {
        btnAgregarGF.addEventListener('click', () => {
            abrirModalGastoFijo();
        });
    }

    // Botón Copiar Mes Anterior
    const btnCopiarMes = document.getElementById('btn-copiar-mes-anterior-gf');
    if (btnCopiarMes) {
        btnCopiarMes.addEventListener('click', async () => {
            if (!confirm(`¿Copiar la estructura de gastos fijos del mes anterior al mes actual (${currentSelectedMonth})?`)) return;
            try {
                const res = await fetch('/api/gastos_fijos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'copiar_mes_anterior', mes_destino: currentSelectedMonth })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(`${data.copiados} conceptos copiados desde ${data.desde}`);
                    fetchGastosFijos();
                } else {
                    showToast(data.error || 'No hay datos anteriores para copiar', 'error');
                }
            } catch (e) { showToast('Error al copiar', 'error'); }
        });
    }

    // 6. Compras ARCA CSV
    let arcaData = [];
    let arcaSortKey = 'fecha_emision';
    let arcaSortDesc = true;

    window.sortArca = function (key) {
        if (arcaSortKey === key) {
            arcaSortDesc = !arcaSortDesc;
        } else {
            arcaSortKey = key;
            arcaSortDesc = (key === 'fecha_emision' || key === 'imp_total');
        }
        renderArcaCompras();
    };

    window.fetchArcaComprasLocal = function () {
        const cbx = document.getElementById('cbx-pagar-mes');
        if (cbx) cbx.checked = false;
        fetchArcaCompras();
    };

    async function fetchArcaCompras() {
        try {
            const localMonthFilter = document.getElementById('arca-month-filter');
            let selectedMonth = currentSelectedMonth;
            if (localMonthFilter && localMonthFilter.value !== 'all') {
                selectedMonth = localMonthFilter.value;
            } else if (localMonthFilter && localMonthFilter.value === 'all') {
                selectedMonth = ''; // Para ver todos los meses si selecciona "Todos los meses" en el filtro local
            }

            const mesParam = selectedMonth ? '?mes=' + selectedMonth : '';
            const res = await fetch('/api/arca_compras' + mesParam);
            const data = await res.json();

            const el_pend = document.getElementById('arca-count-pendientes');
            const el_pag = document.getElementById('arca-count-pagados');
            const el_tot = document.getElementById('arca-total-importe');
            if (el_pend) el_pend.textContent = data.resumen.pendientes;
            if (el_pag) el_pag.innerHTML = `${data.resumen.pagados} (<span style="color:var(--text-secondary); font-size:0.85em;">${formatCurrency(data.resumen.pagados_total || 0)}</span>)`;
            if (el_tot) el_tot.textContent = formatCurrency(data.resumen.total_importe);

            arcaData = data.compras || [];
            renderArcaCompras();
        } catch (e) {
            console.error("Error cargando compras ARCA:", e);
        }
    }

    window.renderArcaCompras = function () {
        const tbody = document.getElementById('tbl-arca-compras-body');
        if (!tbody) return;

        const filterVal = document.getElementById('arca-filter') ? document.getElementById('arca-filter').value : 'all';

        let filtered = [...arcaData];
        if (filterVal === 'recibida') filtered = filtered.filter(c => c.factura_recibida);
        if (filterVal === 'no_recibida') filtered = filtered.filter(c => !c.factura_recibida);
        if (filterVal === 'pendiente') filtered = filtered.filter(c => c.estado !== 'Pagado');
        if (filterVal === 'pagado') filtered = filtered.filter(c => c.estado === 'Pagado');

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
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-secondary); padding: 2rem;">
                No hay compras que coincidan con los filtros para este período.
            </td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(c => {
            const recibida = c.factura_recibida
                ? `<span title="Factura física recibida y escaneada" style="color: #047857; font-size: 1.1rem;"><i class="fa-solid fa-circle-check"></i></span>`
                : `<button class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 2px 7px;" onclick="marcarArcaRecibida(${c.id})" title="Marcar como factura recibida físicamente"><i class="fa-solid fa-qrcode"></i> Recibir</button>`;

            const estadoBadge = c.estado === 'Pagado'
                ? `<span style="color: #047857; font-weight: 700; font-size: 0.8rem;"><i class="fa-solid fa-check"></i> Pagado</span>
                   <br><small style="color: var(--text-secondary); font-size: 0.7rem;">${escapeHtml(c.metodo_pago || '')}</small>`
                : `<span style="color: #f59e0b; font-size: 0.8rem;"><i class="fa-solid fa-clock"></i> Pendiente</span>`;

            let metodoColContent = '';
            if (c.estado !== 'Pagado') {
                metodoColContent = `
                    <select class="form-control" style="font-size: 0.78rem; padding: 3px 6px; height: 30px; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--border-color); width: 155px; display: inline-block;"
                        onchange="if(this.value) pagarArcaCompra(${c.id}, this.value)">
                        <option value="" disabled selected style="color: var(--text-secondary);">Pagar con...</option>
                        <option value="Efectivo" style="color: #10b981; font-weight: 700; background: #ecfdf5;">🟩 Efectivo</option>
                        <option value="Galicia" style="color: #ea580c; font-weight: 700; background: #fff7ed;">🟧 Galicia</option>
                        <option value="Mercado Pago" style="color: #2563eb; font-weight: 700; background: #eff6ff;">🟦 Mercado Pago</option>
                        <option value="Tarjeta crédito" style="color: #7c3aed; font-weight: 700; background: #faf5ff;">🟪 Tarjeta crédito</option>
                    </select>
                `;
            } else {
                let mObj = METODOS_PAGO.find(m => m.key.toLowerCase() === (c.metodo_pago || '').toLowerCase());
                if (!mObj) {
                    if (c.metodo_pago === 'Efectivo' || c.metodo_pago === 'M1' || c.metodo_pago === 'Efectivo/Caja Chica') mObj = METODOS_PAGO[0];
                    else if (c.metodo_pago === 'Galicia') mObj = METODOS_PAGO[1];
                    else if (c.metodo_pago === 'Mercado Pago' || c.metodo_pago === 'M2') mObj = METODOS_PAGO[2];
                    else mObj = METODOS_PAGO[3];
                }

                metodoColContent = `
                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                        <span class="badge" style="background: ${mObj.bg}; color: ${mObj.color}; border: 1px solid ${mObj.border}; font-weight: 700; font-size: 0.78rem; padding: 4px 10px; border-radius: 8px;">
                            ${escapeHtml(mObj.label)}
                        </span>
                        <button class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 3px 7px;" onclick="despagarArcaCompra(${c.id})" title="Deshacer Pago">
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>
                    </div>
                `;
            }

            const rowBg = c.estado === 'Pagado' ? 'background: rgba(52,211,153,0.04);' : (c.factura_recibida ? 'background: rgba(59,130,246,0.05);' : '');

            const denom = escapeHtml(c.denominacion_emisor || '-');
            const shortDenom = denom.length > 35 ? denom.substring(0, 35) + '...' : denom;

            return `
                <tr style="${rowBg}">
                    <td style="font-family: monospace; font-size: 0.82rem;">${escapeHtml(c.fecha_emision || '-')}</td>
                    <td title="${denom}"><strong>${shortDenom}</strong></td>
                    <td style="text-align: right; color: #f59e0b;">${formatCurrency(c.total_iva)}</td>
                    <td style="text-align: right; font-size: 0.88rem; font-weight: 700; color: var(--text-primary);">${formatCurrency(c.imp_total)}</td>
                    <td style="text-align: center;">${recibida}</td>
                    <td style="text-align: center;">${estadoBadge}</td>
                    <td style="text-align: center; white-space: nowrap;">${metodoColContent}</td>
                </tr>
            `;
        }).join('');
    };

    window.pagarArcaCompra = async function (id, metodo) {
        try {
            const res = await fetch(`/api/arca_compras/${id}/marcar_pago`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metodo_pago: metodo })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Pagado con ${metodo}`);
                fetchArcaCompras();
            }
        } catch (e) { showToast('Error al marcar pago', 'error'); }
    };
    window.handleMarcarMesPagado = async function (cbx) {
        if (!cbx.checked) return;

        let mes = document.getElementById('arca-month-filter').value;
        if (mes === 'all') mes = currentSelectedMonth;

        if (mes === 'all' || !mes) {
            alert("Por favor, selecciona un mes específico en el filtro antes de usar esta opción.");
            cbx.checked = false;
            return;
        }

        if (!confirm(`¿Estás seguro de marcar TODAS las facturas de ${mes} como PAGADAS?`)) {
            cbx.checked = false;
            return;
        }

        try {
            const res = await fetch(`/api/test/marcar_mes_pagado`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mes: mes })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Se han marcado ${data.actualizados} facturas como pagadas para el mes ${mes}`);
                if (window.fetchArcaComprasLocal) fetchArcaComprasLocal();
                else fetchArcaCompras();
            } else {
                showToast(data.message || 'Error al actualizar', 'error');
                cbx.checked = false;
            }
        } catch (e) {
            showToast('Error de red al actualizar', 'error');
            cbx.checked = false;
        }
    };

    window.despagarArcaCompra = async function (id) {
        if (!confirm('¿Deshacer el pago de esta compra?')) return;
        try {
            await fetch(`/api/arca_compras/${id}/desmarcar_pago`, { method: 'POST' });
            showToast('Pago deshecho');
            fetchArcaCompras();
        } catch (e) { showToast('Error', 'error'); }
    };

    window.marcarArcaRecibida = async function (id) {
        try {
            await fetch(`/api/arca_compras/${id}/marcar_recibida`, { method: 'POST' });
            showToast('Factura marcada como recibida');
            fetchArcaCompras();
        } catch (e) { showToast('Error', 'error'); }
    };


    // ==========================================
    // MODAL RECAUDACIÓN & CONCILIACIÓN CON LOTES DE ALIVIO
    // ==========================================
    const modalRecaudacion = document.getElementById('modal-recaudacion');
    const btnNuevaRecaudacion = document.getElementById('btn-nueva-recaudacion');
    const btnCargarPlanillaRec = document.getElementById('btn-cargar-planilla-rec');
    const btnCloseModalRec = document.getElementById('btn-close-modal-rec');
    const btnCancelModalRec = document.getElementById('btn-cancel-modal-rec');
    const btnSaveModalRec = document.getElementById('btn-save-modal-rec');
    const btnAddLoteRec = document.getElementById('btn-add-lote-rec');
    const recModalFecha = document.getElementById('rec-modal-fecha');

    function updateModalRecDiaAuto() {
        if (!recModalFecha || !recModalFecha.value) return;
        const parts = recModalFecha.value.split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const dateObj = new Date(year, month, day);
            if (!isNaN(dateObj.getTime())) {
                const daysMap = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                const diaEl = document.getElementById('rec-modal-dia');
                if (diaEl) diaEl.value = daysMap[dateObj.getDay()];
            }
        }
    }

    if (recModalFecha) {
        recModalFecha.addEventListener('change', updateModalRecDiaAuto);
        recModalFecha.addEventListener('input', updateModalRecDiaAuto);
    }

    function recalcLotesTotal() {
        const lotesContainer = document.getElementById('lotes-container');
        if (!lotesContainer) return 0;

        const inputs = lotesContainer.querySelectorAll('.input-lote-monto');
        let total = 0;
        inputs.forEach(input => {
            const val = parseFloat(input.value || 0);
            if (!isNaN(val) && val > 0) {
                total += val;
            }
        });

        const totalEl = document.getElementById('rec-modal-lotes-total');
        if (totalEl) totalEl.textContent = formatCurrency(total);

        const efecRealInput = document.getElementById('rec-modal-efec-real');
        if (efecRealInput) efecRealInput.value = total;

        return total;
    }

    function addLoteRow(monto = '') {
        const container = document.getElementById('lotes-container');
        if (!container) return;

        const count = container.children.length + 1;
        const row = document.createElement('div');
        row.className = 'lote-row';
        row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-weight: 500;';
        row.innerHTML = `
            <span class="lote-label" style="font-weight:700; width:35px; color:#047857;">L${count}</span>
            <input type="number" class="form-control input-lote-monto" placeholder="Importe de lote ($)" value="${monto}" style="flex:1;">
            <button type="button" class="btn btn-secondary btn-sm btn-del-lote" style="padding:0.35rem 0.65rem; color:#ef4444;" title="Eliminar Lote">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;

        const input = row.querySelector('.input-lote-monto');
        input.addEventListener('input', recalcLotesTotal);
        input.addEventListener('change', recalcLotesTotal);

        const btnDel = row.querySelector('.btn-del-lote');
        btnDel.addEventListener('click', () => {
            row.remove();
            const rows = container.querySelectorAll('.lote-row');
            rows.forEach((r, idx) => {
                const label = r.querySelector('.lote-label');
                if (label) label.textContent = `L${idx + 1}`;
            });
            recalcLotesTotal();
        });

        container.appendChild(row);
        recalcLotesTotal();
    }

    function renderLotesInModal(lotesList) {
        const container = document.getElementById('lotes-container');
        if (!container) return;
        container.innerHTML = '';

        if (Array.isArray(lotesList) && lotesList.length > 0) {
            lotesList.forEach(monto => addLoteRow(monto));
        } else {
            // Por defecto crear 3 campos de lotes para carga veloz (ejemplo L1, L2, L3)
            for (let i = 0; i < 3; i++) {
                addLoteRow('');
            }
        }
    }

    if (btnAddLoteRec) {
        btnAddLoteRec.addEventListener('click', () => addLoteRow(''));
    }

    function openModalRecaudacion(record = null) {
        if (!modalRecaudacion) return;

        const todayStr = new Date().toISOString().split('T')[0];

        document.getElementById('rec-modal-fecha').value = record ? record.fecha : todayStr;
        updateModalRecDiaAuto();
        if (record && record.dia_nombre) {
            document.getElementById('rec-modal-dia').value = record.dia_nombre;
        }

        document.getElementById('rec-modal-cubiertos').value = record ? record.cubiertos || 0 : '';
        const inputFeriado = document.getElementById('rec-modal-feriado');
        if (inputFeriado) {
            inputFeriado.checked = record ? (record.es_feriado == 1) : false;
        }

        document.getElementById('rec-modal-mp-real').value = record ? record.mp_real || 0 : '';
        document.getElementById('rec-modal-nave-real').value = record ? record.nave_real || 0 : '';
        document.getElementById('rec-modal-py-real').value = record ? record.py_real || 0 : '';
        document.getElementById('rec-modal-banco-real').value = record ? record.banco_real || 0 : '';
        document.getElementById('rec-modal-efec-real').value = record ? record.efectivo_real || 0 : '';

        document.getElementById('rec-modal-mp-maxi').value = record ? record.mp_maxi || 0 : '';
        document.getElementById('rec-modal-nave-maxi').value = record ? record.nave_maxi || 0 : '';
        document.getElementById('rec-modal-py-maxi').value = record ? record.py_maxi || 0 : '';
        document.getElementById('rec-modal-banco-maxi').value = record ? record.banco_maxi || 0 : '';
        document.getElementById('rec-modal-efec-maxi').value = record ? record.efectivo_maxi || 0 : '';

        document.getElementById('rec-modal-comentario').value = record ? record.comentario || '' : '';

        let lotesArr = [];
        if (record && record.lotes_json) {
            try {
                lotesArr = typeof record.lotes_json === 'string' ? JSON.parse(record.lotes_json) : record.lotes_json;
            } catch (e) { }
        }
        if (!Array.isArray(lotesArr) || lotesArr.length === 0) {
            if (record && record.efectivo_real > 0) {
                lotesArr = [record.efectivo_real];
            }
        }
        renderLotesInModal(lotesArr);

        modalRecaudacion.style.display = 'flex';
    }

    function closeModalRecaudacion() {
        if (modalRecaudacion) modalRecaudacion.style.display = 'none';
    }

    if (btnNuevaRecaudacion) btnNuevaRecaudacion.addEventListener('click', () => openModalRecaudacion());
    if (btnCargarPlanillaRec) btnCargarPlanillaRec.addEventListener('click', () => openModalRecaudacion());
    if (btnCloseModalRec) btnCloseModalRec.addEventListener('click', closeModalRecaudacion);
    if (btnCancelModalRec) btnCancelModalRec.addEventListener('click', closeModalRecaudacion);

    if (btnSaveModalRec) {
        btnSaveModalRec.addEventListener('click', async () => {
            const fecha = document.getElementById('rec-modal-fecha')?.value;
            if (!fecha) {
                showToast("Por favor selecciona una fecha", "error");
                return;
            }

            const diaNombre = document.getElementById('rec-modal-dia')?.value || '';
            const cubiertos = parseInt(document.getElementById('rec-modal-cubiertos')?.value || 0);
            const esFeriado = document.getElementById('rec-modal-feriado')?.checked ? 1 : 0;

            const mpReal = parseFloat(document.getElementById('rec-modal-mp-real')?.value || 0);
            const naveReal = parseFloat(document.getElementById('rec-modal-nave-real')?.value || 0);
            const pyReal = parseFloat(document.getElementById('rec-modal-py-real')?.value || 0);
            const bancoReal = parseFloat(document.getElementById('rec-modal-banco-real')?.value || 0);

            const mpMaxi = parseFloat(document.getElementById('rec-modal-mp-maxi')?.value || 0);
            const naveMaxi = parseFloat(document.getElementById('rec-modal-nave-maxi')?.value || 0);
            const pyMaxi = parseFloat(document.getElementById('rec-modal-py-maxi')?.value || 0);
            const bancoMaxi = parseFloat(document.getElementById('rec-modal-banco-maxi')?.value || 0);
            const efecMaxi = parseFloat(document.getElementById('rec-modal-efec-maxi')?.value || 0);

            const comentario = document.getElementById('rec-modal-comentario')?.value || '';

            const lotesArr = [];
            const lotesInputs = document.querySelectorAll('#lotes-container .input-lote-monto');
            lotesInputs.forEach(input => {
                const val = parseFloat(input.value || 0);
                if (!isNaN(val) && val > 0) {
                    lotesArr.push(val);
                }
            });

            const efecReal = lotesArr.reduce((a, b) => a + b, 0) || parseFloat(document.getElementById('rec-modal-efec-real')?.value || 0);

            const payload = {
                fecha,
                dia_nombre: diaNombre,
                cubiertos,
                es_feriado: esFeriado,
                proyeccion_recaudacion: 0,
                mp_real: mpReal,
                nave_real: naveReal,
                py_real: pyReal,
                banco_real: bancoReal,
                efectivo_real: efecReal,
                efectivo_cub: efecReal,
                mp_maxi: mpMaxi,
                nave_maxi: naveMaxi,
                py_maxi: pyMaxi,
                banco_maxi: bancoMaxi,
                efectivo_maxi: efecMaxi,
                comentario,
                lotes_json: JSON.stringify(lotesArr)
            };

            try {
                const res = await fetch('/api/recaudacion', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    showToast("Registro de recaudación guardado correctamente");
                    closeModalRecaudacion();
                    fetchRecaudacion();
                } else {
                    showToast("Error guardando recaudación", "error");
                }
            } catch (e) {
                showToast("Error de red guardando recaudación", "error");
            }
        });
    }

    window.editarRecaudacion = function (fecha) {
        const record = cachedRecaudacionRecords.find(r => r.fecha === fecha);
        openModalRecaudacion(record || { fecha });
    };

    window.eliminarRecaudacion = async function (fecha) {
        if (!confirm(`¿Deseas eliminar el registro de recaudación del día ${fecha}?`)) return;
        try {
            const res = await fetch(`/api/recaudacion?fecha=${fecha}`, { method: 'DELETE' });
            if (res.ok) {
                showToast("Registro eliminado");
                fetchRecaudacion();
            } else {
                showToast("Error al eliminar registro", "error");
            }
        } catch (e) {
            showToast("Error de conexión", "error");
        }
    };

    // Manejadores Modal Gastos Fijos de Estacionamiento
    const modalGastosEst = document.getElementById('modal-gastos-estacionamiento');
    const btnOpenModalGastosEst = document.getElementById('btn-open-modal-gastos-est');
    const btnCloseModalGastosEst = document.getElementById('btn-close-modal-gastos-est');
    const btnCloseModalGastosEstFooter = document.getElementById('btn-close-modal-gastos-est-footer');

    if (btnOpenModalGastosEst) {
        btnOpenModalGastosEst.addEventListener('click', () => {
            if (modalGastosEst) modalGastosEst.style.display = 'flex';
            fetchEstacionamientoGastos();
        });
    }
    if (btnCloseModalGastosEst) {
        btnCloseModalGastosEst.addEventListener('click', () => {
            if (modalGastosEst) modalGastosEst.style.display = 'none';
        });
    }
    if (btnCloseModalGastosEstFooter) {
        btnCloseModalGastosEstFooter.addEventListener('click', () => {
            if (modalGastosEst) modalGastosEst.style.display = 'none';
        });
    }

    window.editarDiaEstacionamiento = function (fecha, dia_nombre, tc, cash, mp, comentario) {
        document.getElementById('est-in-fecha').value = fecha || '';
        if (typeof updateEstacionamientoDiaAuto === 'function') {
            updateEstacionamientoDiaAuto();
        } else {
            document.getElementById('est-in-dia').value = dia_nombre || '';
        }
        document.getElementById('est-in-tc').value = tc || '';
        document.getElementById('est-in-cash').value = cash || '';
        document.getElementById('est-in-mp').value = mp || '';
        document.getElementById('est-in-comentario').value = comentario || '';

        const rowInline = document.getElementById('row-inline-add-est');
        if (rowInline) {
            rowInline.scrollIntoView({ behavior: 'smooth', block: 'center' });
            rowInline.style.transition = 'background-color 0.5s';
            rowInline.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            setTimeout(() => { rowInline.style.backgroundColor = ''; }, 1000);
        }

        if (typeof updateInlineEstCalculations === 'function') {
            updateInlineEstCalculations();
        }
    };

    window.eliminarDiaEstacionamiento = async function (fecha) {
        if (!confirm(`¿Deseas eliminar el registro de la fecha ${fecha}?`)) return;
        try {
            const res = await fetch('/api/estacionamiento', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fecha })
            });
            if (res.ok) {
                showToast("Registro de estacionamiento eliminado");
                fetchEstacionamiento();
            }
        } catch (e) {
            showToast("Error al eliminar registro", "error");
        }
    };

    fetchArcaCredentials(true);
    fetchUserHistory();

    // --- Botón Doctor (sidebar-footer) ---
    // El botón tiene data-tab="doctor", switchTab lo captura automáticamente
    // mediante allTabItems. No se necesita lógica adicional.

    // --- Ayuda: Lazy-load de Driver.js ---
    // Driver.js (~80KB gz) se carga SOLO cuando el usuario hace clic en Ayuda.
    // Esto elimina el peso del CSS + JS bloqueante en la carga inicial.
    const btnHelp = document.getElementById('btn-help');
    // --- Dashboard Empresa ---
    async function fetchDashboardEmpresa() {
        try {
            const mesParam = currentSelectedMonth ? '?mes=' + currentSelectedMonth : '';
            const res = await fetch('/api/dashboard/empresa' + mesParam);
            const data = await res.json();

            document.getElementById('emp-stat-ingresos').textContent = formatCurrency(data.ingresos.total);
            document.getElementById('emp-stat-egresos').textContent = formatCurrency(data.egresos.total);

            const ganancia = data.ganancia_neta;
            const gananciaElem = document.getElementById('emp-stat-ganancia');
            const gananciaCard = document.getElementById('emp-card-ganancia');
            const gananciaIcon = document.getElementById('emp-icon-ganancia');
            const gananciaTitle = document.getElementById('emp-title-ganancia');

            gananciaElem.textContent = formatCurrency(ganancia);
            if (ganancia >= 0) {
                gananciaCard.style.background = 'rgba(52, 211, 153, 0.05)';
                gananciaCard.style.border = '1px solid rgba(52, 211, 153, 0.2)';
                gananciaIcon.style.background = 'rgba(52, 211, 153, 0.2)';
                gananciaIcon.style.color = '#34d399';
                gananciaIcon.innerHTML = '<i class="fa-solid fa-face-smile"></i>';
                gananciaTitle.textContent = 'Ganancia Neta';
            } else {
                gananciaCard.style.background = 'rgba(239, 68, 68, 0.05)';
                gananciaCard.style.border = '1px solid rgba(239, 68, 68, 0.2)';
                gananciaIcon.style.background = 'rgba(239, 68, 68, 0.2)';
                gananciaIcon.style.color = '#ef4444';
                gananciaIcon.innerHTML = '<i class="fa-solid fa-face-frown"></i>';
                gananciaTitle.textContent = 'Pérdida Neta';
            }

            // Margen de rentabilidad
            const margenElem = document.getElementById('emp-stat-margen');
            if (margenElem) {
                const margen = data.margen_rentabilidad || 0;
                margenElem.textContent = `${margen > 0 ? '+' : ''}${margen}%`;
                margenElem.style.color = margen >= 0 ? '#10b981' : '#ef4444';
            }

            // Cubiertos KPIs
            if (document.getElementById('emp-stat-total-cubiertos')) {
                document.getElementById('emp-stat-total-cubiertos').textContent = `${data.cubiertos.total.toLocaleString('es-AR')} CUB`;
            }
            if (document.getElementById('emp-sub-dias-cubiertos')) {
                document.getElementById('emp-sub-dias-cubiertos').textContent = `${data.cubiertos.dias_activos} días registrados`;
            }
            if (document.getElementById('emp-stat-promedio-cubiertos')) {
                document.getElementById('emp-stat-promedio-cubiertos').textContent = `${data.cubiertos.promedio_diario.toLocaleString('es-AR')} CUB/día`;
            }

            // Mejor Día de Cubierto
            const mejorCub = data.cubiertos.mejor_dia;
            if (document.getElementById('emp-stat-mejor-cubierto')) {
                if (mejorCub) {
                    const parts = mejorCub.fecha.split('-');
                    const fechaFmt = `${parts[2]}/${parts[1]}`;
                    const diaFmt = (mejorCub.dia_nombre || '').charAt(0).toUpperCase() + (mejorCub.dia_nombre || '').slice(1);
                    document.getElementById('emp-stat-mejor-cubierto').textContent = `${diaFmt} ${fechaFmt} (${mejorCub.cubiertos})`;
                } else {
                    document.getElementById('emp-stat-mejor-cubierto').textContent = 'Sin registros';
                }
            }
            if (document.getElementById('emp-sub-mejor-cubierto')) {
                if (mejorCub) {
                    document.getElementById('emp-sub-mejor-cubierto').textContent = `Recaudación: ${formatCurrency(mejorCub.total_diario)}`;
                } else {
                    document.getElementById('emp-sub-mejor-cubierto').textContent = 'Máxima afluencia';
                }
            }

            // Ticket Promedio / Cubierto
            if (document.getElementById('emp-stat-ticket-promedio')) {
                document.getElementById('emp-stat-ticket-promedio').textContent = formatCurrency(data.cubiertos.ticket_promedio);
            }

            // Desglose de Ingresos
            if (document.getElementById('emp-ingreso-rec')) {
                document.getElementById('emp-ingreso-rec').textContent = formatCurrency(data.ingresos.recaudacion);
            }
            if (document.getElementById('emp-ingreso-est')) {
                document.getElementById('emp-ingreso-est').textContent = formatCurrency(data.ingresos.estacionamiento);
            }
            if (document.getElementById('emp-ingreso-est-cash')) {
                document.getElementById('emp-ingreso-est-cash').textContent = formatCurrency(data.ingresos.estacionamiento_cash || 0);
            }
            if (document.getElementById('emp-ingreso-est-mp')) {
                document.getElementById('emp-ingreso-est-mp').textContent = formatCurrency(data.ingresos.estacionamiento_mp || 0);
            }

            // Desglose de Egresos
            if (document.getElementById('emp-egreso-fijo')) {
                document.getElementById('emp-egreso-fijo').textContent = formatCurrency(data.egresos.fijos);
            }
            if (document.getElementById('emp-egreso-arca')) {
                const pendText = data.pendientes.proveedores > 0 ? ` (Pendiente: ${formatCurrency(data.pendientes.proveedores)})` : '';
                document.getElementById('emp-egreso-arca').textContent = formatCurrency(data.egresos.proveedores) + pendText;
            }
            if (document.getElementById('emp-egreso-caja')) {
                document.getElementById('emp-egreso-caja').textContent = formatCurrency(data.egresos.caja_chica);
            }
            if (document.getElementById('emp-egreso-retiros')) {
                document.getElementById('emp-egreso-retiros').textContent = formatCurrency(data.egresos.retiros_recaudacion || 0);
            }

            // Renderizar Gráficos de Dashboard Empresa
            await waitForChart();

            // Gráfico 1: Estructura Financiera (Ingresos vs Egresos)
            const canvasEstructura = document.getElementById('chartEmpresaEstructura');
            if (canvasEstructura) {
                if (chartEmpresaEstructuraInst) chartEmpresaEstructuraInst.destroy();
                const ctx1 = canvasEstructura.getContext('2d');
                chartEmpresaEstructuraInst = new Chart(ctx1, {
                    type: 'bar',
                    data: {
                        labels: ['Ingresos Totales', 'Gastos Fijos', 'Proveedores (ARCA)', 'Caja Chica', 'Retiros Recaudación'],
                        datasets: [{
                            label: 'Monto ($)',
                            data: [data.ingresos.total, data.egresos.fijos, data.egresos.proveedores, data.egresos.caja_chica, data.egresos.retiros_recaudacion || 0],
                            backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#dc2626'],
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                ticks: {
                                    callback: function (value) {
                                        return '$' + (value / 1000000).toFixed(1) + 'M';
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Gráfico 2: Evolución Diaria de Cubiertos (CUB) y Recaudación
            const canvasCubiertos = document.getElementById('chartEmpresaCubiertos');
            if (canvasCubiertos && data.diario && data.diario.length > 0) {
                if (chartEmpresaCubiertosInst) chartEmpresaCubiertosInst.destroy();
                const ctx2 = canvasCubiertos.getContext('2d');

                const labelsDiario = data.diario.map(d => {
                    const parts = d.fecha.split('-');
                    return `${parts[2]}/${parts[1]}`;
                });
                const recDiariaData = data.diario.map(d => d.total_diario || 0);
                const cubDiarioData = data.diario.map(d => d.cubiertos || 0);

                chartEmpresaCubiertosInst = new Chart(ctx2, {
                    type: 'bar',
                    data: {
                        labels: labelsDiario,
                        datasets: [
                            {
                                type: 'line',
                                label: 'Cubiertos (CUB)',
                                data: cubDiarioData,
                                borderColor: '#a855f7',
                                backgroundColor: '#a855f7',
                                yAxisID: 'y1',
                                tension: 0.3,
                                borderWidth: 3,
                                pointRadius: 4
                            },
                            {
                                type: 'bar',
                                label: 'Recaudación ($)',
                                data: recDiariaData,
                                backgroundColor: 'rgba(59, 130, 246, 0.4)',
                                borderColor: '#3b82f6',
                                borderWidth: 1,
                                yAxisID: 'y',
                                borderRadius: 4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top' }
                        },
                        scales: {
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                title: { display: true, text: 'Recaudación ($)', color: '#64748b' },
                                ticks: {
                                    callback: function (val) { return '$' + (val / 1000000).toFixed(1) + 'M'; }
                                }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                grid: { drawOnChartArea: false },
                                title: { display: true, text: 'Cubiertos (CUB)', color: '#a855f7' },
                                ticks: { precision: 0 }
                            }
                        }
                    }
                });
            }

        } catch (e) {
            console.error('Error fetching dashboard empresa:', e);
        }
    }

    let driverLoaded = false;
    let driverInstance = null;

    function loadDriverJs(callback) {
        if (driverLoaded) { callback(); return; }

        // Cargar CSS de Driver.js
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/driver.js@1.0.1/dist/driver.css';
        document.head.appendChild(link);

        // Cargar JS de Driver.js
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/driver.js@1.0.1/dist/driver.js.iife.js';
        script.onload = () => {
            driverLoaded = true;
            callback();
        };
        script.onerror = () => {
            showToast('No se pudo cargar el módulo de ayuda. Verifica tu conexión.', 'error');
        };
        document.body.appendChild(script);
    }

    function startTour() {
        if (!window.driver) return;
        if (!driverInstance) {
            driverInstance = window.driver.js.driver({
                showProgress: true,
                steps: [
                    { element: '#group-facturas', popover: { title: 'Facturas', description: 'Gestiona todas tus facturas: procesa, visualiza y carga CSV de ARCA.', side: 'right' } },
                    { element: '[data-tab="cuentas-pagar"]', popover: { title: 'Proveedores a Pagar', description: 'Seguimiento de deudas con proveedores y estado de pagos.', side: 'right' } },
                    { element: '[data-tab="recaudacion"]', popover: { title: 'Recaudación', description: 'Conciliación diaria entre Maxirest y cada plataforma de cobro.', side: 'right' } },
                    { element: '[data-tab="estacionamiento"]', popover: { title: 'Estacionamiento', description: 'Arqueo diario de TicketControl vs efectivo y MercadoPago.', side: 'right' } },
                    { element: '[data-tab="caja-chica"]', popover: { title: 'Caja Chica', description: 'Movimientos de fondos, retiros y arqueo de billetes.', side: 'right' } },
                    { element: '[data-tab="gastos-fijos"]', popover: { title: 'Gastos Fijos', description: 'Dashboard de ganancia neta contra costos estructurales.', side: 'right' } },
                    { element: '[data-tab="suppliers"]', popover: { title: 'Proveedores', description: 'Lista de proveedores y sus reglas de detección automática.', side: 'right' } },
                    { element: '[data-tab="settings"]', popover: { title: 'Ajustes', description: 'Configura tu API Key de Gemini, CUIT y credenciales de ARCA.', side: 'right' } },
                ]
            });
        }
        driverInstance.drive();
    }

    if (btnHelp) {
        btnHelp.addEventListener('click', () => {
            loadDriverJs(startTour);
        });
    }

    // --- Retiros Directos de Recaudación ---
    async function fetchRetirosRecaudacion() {
        try {
            const url = '/api/recaudacion/retiros' + (currentSelectedMonth ? '?mes=' + currentSelectedMonth : '');
            const res = await fetch(url);
            const data = await res.json();

            const statElem = document.getElementById('rec-stat-retiros');
            if (statElem) statElem.textContent = formatCurrency(data.total || 0);

            const tbody = document.getElementById('tbl-retiros-recaudacion-body');
            if (!tbody) return;

            if (!data.retiros || data.retiros.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-secondary); padding: 1.5rem;">No hay retiros de recaudación registrados en este período</td></tr>`;
                return;
            }

            tbody.innerHTML = data.retiros.map(r => {
                let badgeColor = '#ef4444';
                if (r.medio_pago === 'MercadoPago') badgeColor = '#3b82f6';
                if (r.medio_pago === 'Banco') badgeColor = '#f59e0b';

                return `
                    <tr>
                        <td><strong>${escapeHtml(r.fecha)}</strong></td>
                        <td><strong style="color: #ef4444;">${formatCurrency(r.monto)}</strong></td>
                        <td><span class="badge" style="background: ${badgeColor}20; color: ${badgeColor}; border: 1px solid ${badgeColor}40; font-weight:700;">${escapeHtml(r.medio_pago || 'Efectivo')}</span></td>
                        <td><strong>${escapeHtml(r.motivo || '-')}</strong></td>
                        <td>${escapeHtml(r.responsable || '-')}</td>
                        <td>${escapeHtml(r.comentario || '-')}</td>
                        <td style="display: flex; gap: 4px;">
                            <button class="btn btn-secondary btn-sm" onclick="editarRetiroRecaudacion(${r.id}, '${escapeHtml(r.fecha)}', ${r.monto}, '${escapeHtml(r.medio_pago || 'Efectivo')}', '${escapeHtml(r.motivo || '').replace(/'/g, "\\'")}', '${escapeHtml(r.responsable || '').replace(/'/g, "\\'")}', '${escapeHtml(r.comentario || '').replace(/'/g, "\\\'")}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn btn-secondary btn-sm" onclick="eliminarRetiroRecaudacion(${r.id})" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            console.error("Error cargando retiros de recaudación:", e);
        }
    }

    const modalRetiro = document.getElementById('modal-retiro-recaudacion');
    const btnNuevoRetiroRec = document.getElementById('btn-nuevo-retiro-rec');
    const btnCloseModalRetiro = document.getElementById('btn-close-modal-retiro');
    const btnCancelModalRetiro = document.getElementById('btn-cancel-modal-retiro');
    const btnSaveModalRetiro = document.getElementById('btn-save-modal-retiro');

    window.abrirModalRetiro = function (id = null, fecha = '', monto = '', medio = 'Efectivo', motivo = '', responsable = '', comentario = '') {
        if (!modalRetiro) return;

        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById('modal-retiro-id').value = id || '';
        document.getElementById('modal-retiro-fecha').value = fecha || todayStr;
        document.getElementById('modal-retiro-monto').value = monto || '';
        document.getElementById('modal-retiro-medio').value = medio || 'Efectivo';
        document.getElementById('modal-retiro-motivo').value = motivo || '';
        document.getElementById('modal-retiro-responsable').value = responsable || '';
        document.getElementById('modal-retiro-comentario').value = comentario || '';

        const titleEl = document.getElementById('modal-retiro-title');
        if (titleEl) {
            titleEl.innerHTML = id ?
                '<i class="fa-solid fa-pen-to-square" style="color: #ef4444;"></i> Editar Retiro de Recaudación' :
                '<i class="fa-solid fa-hand-holding-dollar" style="color: #ef4444;"></i> Registrar Retiro de Recaudación';
        }

        modalRetiro.style.display = 'flex';
        setTimeout(() => {
            document.getElementById('modal-retiro-monto')?.focus();
        }, 50);
    };

    function closeModalRetiro() {
        if (modalRetiro) modalRetiro.style.display = 'none';
    }

    if (btnNuevoRetiroRec) btnNuevoRetiroRec.addEventListener('click', () => abrirModalRetiro());
    if (btnCloseModalRetiro) btnCloseModalRetiro.addEventListener('click', closeModalRetiro);
    if (btnCancelModalRetiro) btnCancelModalRetiro.addEventListener('click', closeModalRetiro);

    if (btnSaveModalRetiro) {
        btnSaveModalRetiro.addEventListener('click', async () => {
            const id = document.getElementById('modal-retiro-id').value;
            const fecha = document.getElementById('modal-retiro-fecha').value;
            const montoStr = document.getElementById('modal-retiro-monto').value;
            const monto = parseFloat(montoStr) || 0;
            const medio_pago = document.getElementById('modal-retiro-medio').value;
            const motivo = document.getElementById('modal-retiro-motivo').value.trim();
            const responsable = document.getElementById('modal-retiro-responsable').value.trim();
            const comentario = document.getElementById('modal-retiro-comentario').value.trim();

            if (!fecha) return showToast("Selecciona una fecha", "error");
            if (isNaN(monto) || monto <= 0) return showToast("Ingresa un monto válido", "error");

            const payload = {
                fecha,
                monto,
                medio_pago,
                motivo,
                responsable,
                comentario
            };
            if (id) payload.id = parseInt(id);

            try {
                const res = await fetch('/api/recaudacion/retiros', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    showToast(id ? "Retiro de recaudación actualizado" : "Retiro de recaudación registrado");
                    closeModalRetiro();
                    fetchRecaudacion();
                } else {
                    showToast(data.error || "Error al guardar retiro", "error");
                }
            } catch (e) {
                showToast("Error de conexión", "error");
            }
        });
    }

    window.editarRetiroRecaudacion = function (id, fecha, monto, medio, motivo, responsable, comentario) {
        abrirModalRetiro(id, fecha, monto, medio, motivo, responsable, comentario);
    };

    window.eliminarRetiroRecaudacion = async function (id) {
        if (!confirm('¿Eliminar este retiro de recaudación?')) return;
        try {
            const res = await fetch(`/api/recaudacion/retiros?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Retiro eliminado');
                fetchRecaudacion();
            } else {
                showToast('Error al eliminar retiro', 'error');
            }
        } catch (e) {
            showToast('Error de conexión', 'error');
        }
    };
});


