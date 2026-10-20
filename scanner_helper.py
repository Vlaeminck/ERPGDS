"""
Módulo de diagnóstico y auto-recuperación del escáner en red para ERP GDS.
Resuelve automáticamente cambios de dirección IP asignados por DHCP al escáner Epson / NAPS2.
"""

import os
import re
import ssl
import time
import socket
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed

# Contexto SSL que no valida certificados autofirmados del escáner embebido
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

def get_naps2_profiles_path():
    """Retorna la ruta al archivo profiles.xml de NAPS2 del usuario actual."""
    appdata = os.environ.get('APPDATA', '')
    if appdata:
        p = os.path.join(appdata, 'NAPS2', 'profiles.xml')
        if os.path.exists(p):
            return p
    # Fallback si APPDATA no está en entorno
    userprofile = os.environ.get('USERPROFILE', '')
    if userprofile:
        p = os.path.join(userprofile, 'AppData', 'Roaming', 'NAPS2', 'profiles.xml')
        if os.path.exists(p):
            return p
    return None

def is_escl_online(host_or_ip, timeout=1.8):
    """
    Verifica rápidamente si el endpoint eSCL del escáner responde HTTP 200 en el puerto 443.
    """
    if not host_or_ip:
        return False
    try:
        url = f"https://{host_or_ip}:443/eSCL/ScannerCapabilities"
        req = urllib.request.Request(url, headers={'User-Agent': 'ERP-GDS-ScannerHelper'})
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=timeout) as resp:
            return resp.getcode() == 200
    except Exception:
        return False

def get_local_subnet():
    """Determina los tres primeros octetos de la IP de la red local (ej: 192.168.1)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        parts = local_ip.split('.')
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}"
    except Exception:
        pass
    return "192.168.1"

def get_arp_devices():
    """
    Lee la tabla ARP del sistema para encontrar pares (IP, MAC).
    """
    devices = []
    try:
        output = subprocess.check_output(['arp', '-a'], text=True, stderr=subprocess.DEVNULL)
        for line in output.splitlines():
            # Buscar formato: 192.168.1.8   a4-d7-3c-e0-d6-e7
            m = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5})', line)
            if m:
                ip, mac = m.group(1), m.group(2).lower()
                # Ignorar IPs de enlace local APIPA (169.254.x.x) y broadcast/multicast
                if not ip.startswith('169.254.') and not ip.startswith('224.') and not ip.startswith('239.') and not ip.endswith('.255'):
                    devices.append((ip, mac))
    except Exception as e:
        print(f"[SCANNER] Error leyendo tabla ARP: {e}", flush=True)
    return devices

def discover_scanner_ip(known_hostnames=None, mac_hint="e0-d6-e7"):
    """
    Descubre la IP actual del escáner Epson en la red local probando:
    1. Coincidencia de dirección MAC en la tabla ARP
    2. Resolución mDNS / NetBIOS (EPSONE0D6E7.local, EPSONE0D6E7)
    3. Sondeo sobre las IPs activas en la tabla ARP
    4. Barrido concurrente en la subred local
    """
    candidates = []

    # 1. Chequeo por MAC en ARP
    arp_list = get_arp_devices()
    for ip, mac in arp_list:
        if mac_hint and mac_hint.lower() in mac:
            print(f"[SCANNER] Coincidencia MAC ({mac}) encontrada en ARP: {ip}", flush=True)
            if is_escl_online(ip, timeout=2.2):
                return ip

    # 2. Chequeo por nombres de host DNS / mDNS
    hostnames_to_try = list(known_hostnames or [])
    for default_h in ['EPSONE0D6E7.local', 'EPSONE0D6E7']:
        if default_h not in hostnames_to_try:
            hostnames_to_try.append(default_h)

    for h in hostnames_to_try:
        try:
            resolved_ip = socket.gethostbyname(h)
            print(f"[SCANNER] Hostname '{h}' resolvió a {resolved_ip}", flush=True)
            if is_escl_online(resolved_ip, timeout=2.0):
                return resolved_ip
        except Exception:
            pass

    # 3. Sondeo rápido sobre las IPs conocidas de la tabla ARP
    arp_ips = [ip for ip, _ in arp_list if ip.startswith("192.168.")]
    if arp_ips:
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_ip = {executor.submit(is_escl_online, ip, 1.8): ip for ip in arp_ips}
            for future in as_completed(future_to_ip):
                ip = future_to_ip[future]
                try:
                    if future.result():
                        print(f"[SCANNER] Escáner detectado en IP activa de ARP: {ip}", flush=True)
                        return ip
                except Exception:
                    pass

    # 4. Barrido concurrente de la subred local (1 a 254)
    subnet = get_local_subnet()
    print(f"[SCANNER] Iniciando sondeo de subred {subnet}.0/24...", flush=True)
    all_ips = [f"{subnet}.{i}" for i in range(1, 255)]
    with ThreadPoolExecutor(max_workers=30) as executor:
        future_to_ip = {executor.submit(is_escl_online, ip, 1.8): ip for ip in all_ips}
        for future in as_completed(future_to_ip):
            ip = future_to_ip[future]
            try:
                if future.result():
                    print(f"[SCANNER] Escáner encontrado en subred: {ip}", flush=True)
                    return ip
            except Exception:
                pass

    return None

def ensure_scanner_profile_valid():
    """
    Verifica que el perfil de NAPS2 apunte a la IP correcta del escáner en la red.
    Si la IP actual no responde (por ejemplo tras reinicio de router por DHCP),
    busca la nueva IP del equipo y actualiza automáticamente profiles.xml.

    Retorna: (ok: bool, current_or_new_ip: str, message: str)
    """
    profiles_path = get_naps2_profiles_path()
    if not profiles_path or not os.path.exists(profiles_path):
        return True, "default", "Perfil NAPS2 no encontrado o usando configuración por defecto."

    try:
        with open(profiles_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extraer Device/ConnectionUri
        conn_match = re.search(r'<ConnectionUri>https?://([^:/]+)(?::\d+)?/eSCL</ConnectionUri>', content, re.IGNORECASE)
        icon_match = re.search(r'<IconUri>https?://([^:/]+)(?::\d+)?/', content, re.IGNORECASE)

        if not conn_match:
            # No es un perfil eSCL de red o tiene otro formato
            return True, "default", "El perfil actual no utiliza protocolo eSCL de red."

        current_target = conn_match.group(1).strip()
        print(f"[SCANNER] Verificando conectividad con escáner en {current_target}...", flush=True)

        # Si responde inmediatamente, todo en orden
        if is_escl_online(current_target, timeout=2.0):
            return True, current_target, f"Escáner en línea y listo en {current_target}."

        print(f"[SCANNER] ¡Atención! El escáner no responde en {current_target}. Iniciando auto-recuperación de IP...", flush=True)

        known_hosts = []
        if icon_match:
            icon_host = icon_match.group(1).strip().rstrip('.')
            if icon_host:
                known_hosts.append(icon_host)

        # Extraer posible sufijo MAC del Device ID (ej: cfe92100-67c4-11d4-a45f-a4d73ce0d6e7 -> e0-d6-e7)
        id_match = re.search(r'<ID>([a-fA-F0-9\-]+)</ID>', content)
        mac_hint = "e0-d6-e7"
        if id_match:
            dev_id = id_match.group(1).replace('-', '')
            if len(dev_id) >= 12:
                last_6 = dev_id[-6:]
                mac_hint = f"{last_6[0:2]}-{last_6[2:4]}-{last_6[4:6]}"

        new_ip = discover_scanner_ip(known_hostnames=known_hosts, mac_hint=mac_hint)

        if not new_ip:
            msg = "El escáner Epson no responde en la red WiFi. Verifica que esté encendido y conectado a la misma red."
            print(f"[SCANNER] {msg}", flush=True)
            return False, current_target, msg

        if new_ip != current_target:
            print(f"[SCANNER AUTO-HEAL] Reemplazando IP en profiles.xml: {current_target} -> {new_ip}", flush=True)
            # Reemplazar en ConnectionUri y en Name
            new_content = content.replace(f"https://{current_target}:443/eSCL", f"https://{new_ip}:443/eSCL")
            new_content = new_content.replace(f"https://{current_target}/eSCL", f"https://{new_ip}:443/eSCL")
            new_content = re.sub(
                r'(<Name>EPSON [^<]*\()(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(\)</Name>)',
                rf'\g<1>{new_ip}\g<3>',
                new_content
            )

            # Guardar backup y sobrescribir
            bak_path = profiles_path + ".bak"
            try:
                with open(bak_path, 'w', encoding='utf-8') as fb:
                    fb.write(content)
            except Exception:
                pass

            with open(profiles_path, 'w', encoding='utf-8') as f:
                f.write(new_content)

            print(f"[SCANNER AUTO-HEAL] Perfil actualizado exitosamente a {new_ip}.", flush=True)
            return True, new_ip, f"IP del escáner actualizada automáticamente a {new_ip}."
        else:
            return True, new_ip, f"Escáner verificado en {new_ip}."

    except Exception as e:
        print(f"[SCANNER] Error en auto-recuperación de perfil: {e}", flush=True)
        return True, "error", f"Error verificando perfil: {e}"

def check_scanner_status():
    """Función de diagnóstico rápido para API."""
    ok, ip, msg = ensure_scanner_profile_valid()
    return {
        "online": ok,
        "ip": ip,
        "message": msg
    }

if __name__ == "__main__":
    print("Ejecutando diagnóstico de escáner...")
    res = check_scanner_status()
    print("Resultado:", res)
