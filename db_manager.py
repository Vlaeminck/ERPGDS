import sqlite3
import os
import config

DB_PATH = os.path.join(config.REGISTROS_FOLDER, "control_interno.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Tabla 1: Recaudación Diaria & Conciliación POS (Maxirest vs Plataforma)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS recaudacion_diaria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT UNIQUE,
        dia_nombre TEXT,
        efectivo_cub INTEGER DEFAULT 0,
        cubiertos INTEGER DEFAULT 0,
        nave_real REAL DEFAULT 0,
        nave_maxi REAL DEFAULT 0,
        diff_nave REAL DEFAULT 0,
        efectivo_real REAL DEFAULT 0,
        efectivo_maxi REAL DEFAULT 0,
        diff_efectivo REAL DEFAULT 0,
        py_real REAL DEFAULT 0,
        py_maxi REAL DEFAULT 0,
        diff_py REAL DEFAULT 0,
        mp_real REAL DEFAULT 0,
        mp_maxi REAL DEFAULT 0,
        diff_mp REAL DEFAULT 0,
        banco_real REAL DEFAULT 0,
        banco_maxi REAL DEFAULT 0,
        diff_banco REAL DEFAULT 0,
        total_diario REAL DEFAULT 0,
        diferencia_total REAL DEFAULT 0,
        proyeccion_recaudacion REAL DEFAULT 0,
        comentario TEXT DEFAULT '',
        diff_proyeccion REAL DEFAULT 0
    )
    ''')

    # Tabla 2: Estacionamiento Diario
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS estacionamiento_diario (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT UNIQUE,
        dia_nombre TEXT,
        caja_ticketcontrol REAL DEFAULT 0,
        controlado_cash REAL DEFAULT 0,
        controlado_mp REAL DEFAULT 0,
        total REAL DEFAULT 0,
        diferencia REAL DEFAULT 0,
        comentario TEXT DEFAULT ''
    )
    ''')

    # Tabla 3: Gastos Operativos de Estacionamiento
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS estacionamiento_gastos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        concepto TEXT UNIQUE,
        monto REAL DEFAULT 0
    )
    ''')

    # Tabla 4: Caja Chica / Alivios Movimientos
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS caja_chica_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT,
        monto_retirado REAL DEFAULT 0,
        monto_ingresado REAL DEFAULT 0,
        motivo TEXT,
        responsable TEXT,
        categoria TEXT DEFAULT 'General'
    )
    ''')

    # Tabla 5: Arqueo Físico de Billetes
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS caja_chica_arqueo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT UNIQUE,
        b_20000 INTEGER DEFAULT 0,
        b_10000 INTEGER DEFAULT 0,
        b_2000 INTEGER DEFAULT 0,
        b_1000 INTEGER DEFAULT 0,
        b_500 INTEGER DEFAULT 0,
        b_200 INTEGER DEFAULT 0,
        b_100 INTEGER DEFAULT 0,
        b_50 INTEGER DEFAULT 0,
        b_20 INTEGER DEFAULT 0,
        total_efectivo_contado REAL DEFAULT 0,
        diferencia_arqueo REAL DEFAULT 0
    )
    ''')

    # Tabla 6: Gastos Fijos
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS gastos_fijos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        concepto TEXT UNIQUE,
        monto_mensual REAL DEFAULT 0
    )
    ''')

    # Tabla 7: Cuentas por Pagar (Proveedores)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS proveedores_cuentas_pagar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proveedor_nombre TEXT,
        factura_numero TEXT,
        fecha TEXT,
        monto_total REAL DEFAULT 0,
        estado TEXT DEFAULT 'Pendiente',
        monto_pagado REAL DEFAULT 0,
        fecha_pago TEXT DEFAULT '',
        medio_pago TEXT DEFAULT ''
    )
    ''')

    conn.commit()
    conn.close()
    seed_initial_data()

def seed_initial_data():
    conn = get_connection()
    cursor = conn.cursor()

    # Seed Gastos Fijos de Estacionamiento si no existen
    cursor.execute("SELECT COUNT(*) FROM estacionamiento_gastos")
    if cursor.fetchone()[0] == 0:
        est_gastos = [
            ("Alquiler", 2330700),
            ("Ramon", 743600),
            ("Monotributo", 70000),
            ("Electricidad", 50000),
            ("Tomi Salgado", 480000),
            ("Arba", 294135),
            ("Municipal", 68412)
        ]
        cursor.executemany("INSERT INTO estacionamiento_gastos (concepto, monto) VALUES (?, ?)", est_gastos)

    # Seed Estacionamiento Diario sample data (from image 2) if empty
    cursor.execute("SELECT COUNT(*) FROM estacionamiento_diario")
    if cursor.fetchone()[0] == 0:
        est_data = [
            ('2026-07-01', 'miércoles', 142500, 67500, 75000, 142500, 0, 'Sin diferencias'),
            ('2026-07-02', 'jueves', 225000, 76000, 150000, 226000, 1000, 'Diferencia en positivo'),
            ('2026-07-03', 'viernes', 215000, 85000, 130000, 215000, 0, 'Sin diferencias'),
            ('2026-07-04', 'sábado', 252500, 77500, 175000, 252500, 0, 'Sin diferencias'),
            ('2026-07-05', 'domingo', 192000, 67500, 125000, 192500, 500, 'Diferencia en positivo'),
            ('2026-07-06', 'lunes', 145000, 75000, 70000, 145000, 0, 'Sin diferencias'),
            ('2026-07-07', 'martes', 30000, 25000, 5000, 30000, 0, 'Sin diferencias'),
            ('2026-07-08', 'miércoles', 400000, 183000, 217500, 400500, 500, 'Diferencia en positivo'),
            ('2026-07-09', 'jueves', 277500, 193500, 80000, 273500, -4000, 'Diferencia en efectivo. Ticket cliente'),
            ('2026-07-10', 'viernes', 245000, 27500, 107500, 255000, 10000, 'Diferencias. Retiro antes del cierre'),
            ('2026-07-11', 'sábado', 132500, 81000, 50000, 131000, -1500, 'Diferencias. Retiro de caja'),
            ('2026-07-12', 'domingo', 120000, 65000, 55000, 120000, 0, 'Sin diferencias'),
            ('2026-07-13', 'lunes', 47500, 12500, 37500, 50000, 25000, 'Diferencia en positivo'),
            ('2026-07-14', 'martes', 160000, 63000, 97500, 160500, 500, 'Diferencia en positivo'),
            ('2026-07-15', 'miércoles', 42500, 20000, 22500, 42500, 0, 'Sin diferencias'),
            ('2026-07-16', 'jueves', 170000, 100500, 70000, 170500, 500, 'Diferencia en positivo'),
            ('2026-07-17', 'viernes', 155000, 62500, 92500, 155000, 0, 'Sin diferencias'),
            ('2026-07-18', 'sábado', 170000, 92500, 77500, 170000, 0, 'Sin diferencias'),
            ('2026-07-19', 'domingo', 17500, 7500, 10000, 17500, 0, 'Sin diferencias'),
            ('2026-07-20', 'lunes', 262500, 87500, 175000, 262500, 0, 'Sin diferencias'),
            ('2026-07-21', 'martes', 255000, 175000, 80000, 255000, 0, 'Sin diferencias'),
            ('2026-07-22', 'miércoles', 225000, 127500, 102500, 230000, 5000, 'Diferencia en positivo'),
            ('2026-07-23', 'jueves', 262500, 144500, 122500, 267000, 4500, 'Diferencia en positivo'),
            ('2026-07-24', 'viernes', 120000, 40000, 80000, 120000, 0, 'Sin diferencias'),
            ('2026-07-25', 'sábado', 330000, 127500, 202500, 330000, 0, 'Sin diferencias'),
            ('2026-07-26', 'domingo', 155000, 60000, 85000, 145000, -10000, 'Diferencia en mercado pago'),
            ('2026-07-27', 'lunes', 157500, 47500, 110000, 157500, 0, 'Sin diferencias')
        ]
        cursor.executemany('''
            INSERT INTO estacionamiento_diario (fecha, dia_nombre, caja_ticketcontrol, controlado_cash, controlado_mp, total, diferencia, comentario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', est_data)

    # Seed Caja Chica / Alivios Movimientos sample data (from image 4) if empty
    cursor.execute("SELECT COUNT(*) FROM caja_chica_movimientos")
    if cursor.fetchone()[0] == 0:
        movs = [
            ('2026-07-01', 100500, 100500, 'Diferencia encontrada 22-07', 'Tomás', 'Ajuste'),
            ('2026-07-02', 0, 67500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-02', 30000, 0, 'Retiro para completar sueldo de Tomás Salgado', 'Tomás', 'Sueldos'),
            ('2026-07-02', 6800, 0, 'Pago Uber de capsulas', 'Tomás', 'Operativo'),
            ('2026-07-03', 0, 76000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-06', 0, 85000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-06', 0, 77500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-06', 0, 67500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-07', 336700, 0, 'Retiro Euge', 'Tomás', 'Retiro'),
            ('2026-07-07', 0, 75000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-08', 0, 25000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-08', 90000, 0, 'Retiro Euge', 'Tomás', 'Retiro'),
            ('2026-07-09', 0, 183000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-10', 0, 193500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-13', 0, 27500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-13', 0, 81000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-13', 0, 65000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-13', 81000, 0, 'Retiro Euge', 'Tomás', 'Retiro'),
            ('2026-07-14', 0, 12500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-14', 0, 63000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-15', 15000, 0, 'Compra libreria', 'Tomás', 'Operativo'),
            ('2026-07-16', 0, 20000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-16', 366000, 0, 'Correcion (Retiro de efectivo, pago Tomi Salgado, otros)', 'Tomás', 'Ajuste'),
            ('2026-07-20', 0, 62500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-20', 0, 92500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-20', 0, 7500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-21', 0, 87500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-22', 0, 175000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-23', 0, 127500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-24', 2900, 0, 'Cambio para salon', 'Tomás', 'Operativo'),
            ('2026-07-24', 0, 144500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-24', 36000, 0, 'Compra de flores Stella', 'Tomás', 'Operativo'),
            ('2026-07-27', 0, 40000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-27', 0, 127500, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-27', 0, 60000, 'Ingreso estacionamiento', 'Tomás', 'Estacionamiento'),
            ('2026-07-28', 319500, 0, 'Pago pachulo', 'Tomás', 'Operativo')
        ]
        cursor.executemany('''
            INSERT INTO caja_chica_movimientos (fecha, monto_retirado, monto_ingresado, motivo, responsable, categoria)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', movs)

    # Seed Recaudación Diaria sample data (from image 1) if empty
    cursor.execute("SELECT COUNT(*) FROM recaudacion_diaria")
    if cursor.fetchone()[0] == 0:
        rec_data = [
            ('2026-07-01', 'miércoles', 390000, 146, 2201400, 2201400, 0, 1372600, 1372530, -70, 342797, 347000, 4203, 6900, 6900, 0, 0, 0, 0, 3923697, 4133, 3294285, '', 629412),
            ('2026-07-02', 'jueves', 230000, 134, 2634699, 2634599, -100, 899000, 898141, -859, 331012, 333600, 2588, 186000, 186000, 0, 205000, 205000, 0, 4255711, 1629, 3240406, '', 1015305),
            ('2026-07-03', 'viernes', 440000, 170, 3523400, 3615390, 91990, 1598300, 1771945, 173645, 373111, 373800, 689, 128000, 128000, 0, 211500, 211500, 0, 5834311, 266324, 4124291, '', 1710020),
            ('2026-07-04', 'sábado', 312600, 232, 3399090, 3399090, 0, 2543700, 2635700, 92000, 389693, 394400, 4707, 228000, 228000, 0, 0, 0, 0, 6560483, 96707, 6255109, '', 305374),
            ('2026-07-05', 'domingo', 270000, 152, 2699400, 2699400, 0, 1944300, 1943555, -745, 180161, 171820, -8341, 225000, 225000, 0, 0, 0, 0, 5048861, -9086, 6228747, '', -1179886),
            ('2026-07-06', 'lunes', 329000, 106, 1483500, 1483500, 0, 880000, 878710, -1290, 447261, 449400, 2139, 0, 0, 0, 93000, 0, -93000, 2810761, -92151, 2349907, '', 460854),
            ('2026-07-07', 'martes', 300000, 48, 884200, 884260, 60, 571300, 816230, 244930, 261526, 264200, 2674, 21000, 61000, 40000, 132000, 132000, 0, 1870026, 207664, 2794800, '', -924774),
            ('2026-07-08', 'miércoles', 1598300, 120, 1739300, 1739300, 0, 363000, 1133025, 770025, 181971, 183200, 1229, 30000, 30000, 0, 0, 0, 0, 2314271, 771254, 3046226, '', -731955)
        ]
        cursor.executemany('''
            INSERT INTO recaudacion_diaria (
                fecha, dia_nombre, efectivo_cub, cubiertos,
                nave_real, nave_maxi, diff_nave,
                efectivo_real, efectivo_maxi, diff_efectivo,
                py_real, py_maxi, diff_py,
                mp_real, mp_maxi, diff_mp,
                banco_real, banco_maxi, diff_banco,
                total_diario, diferencia_total, proyeccion_recaudacion, comentario, diff_proyeccion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', rec_data)

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Base de datos inicializada correctamente.")
