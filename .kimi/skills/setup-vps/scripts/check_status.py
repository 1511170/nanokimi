#!/usr/bin/env python3
"""
Script para verificar el estado de Docker Rootless para usuarios en VPS.
"""
import os
import subprocess
import sys
from pathlib import Path


def run_cmd(cmd, check=True, timeout=5):
    """Ejecuta un comando y retorna stdout."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout
        )
        if check and result.returncode != 0:
            return None
        return result.stdout.strip()
    except:
        return None


def get_home_users():
    """Obtiene lista de usuarios con directorio en /home."""
    home_path = Path("/home")
    users = []
    if home_path.exists():
        for entry in home_path.iterdir():
            if entry.is_dir() and not entry.name.startswith('.'):
                # Verificar que sea un usuario real
                uid = run_cmd(f"id -u {entry.name} 2>/dev/null", check=False)
                if uid and uid.isdigit() and int(uid) >= 900:
                    users.append(entry.name)
    return sorted(users)


def check_subuid(username):
    """Verifica si el usuario tiene rango subuid configurado."""
    result = run_cmd(f"grep '^{username}:' /etc/subuid 2>/dev/null", check=False)
    if result:
        parts = result.split(':')
        if len(parts) >= 3:
            return f"{parts[1]}-{int(parts[1]) + int(parts[2]) - 1}"
    return None


def check_linger(username):
    """Verifica si linger está habilitado."""
    linger_file = Path(f"/var/lib/systemd/linger/{username}")
    return linger_file.exists()


def check_docker_rootless(username, uid):
    """Verifica si Docker Rootless está activo."""
    # Verificar via systemd (usando su para tener permisos)
    result = run_cmd(
        f"su - {username} -c 'export XDG_RUNTIME_DIR=/run/user/{uid} && systemctl --user is-active docker.service 2>/dev/null' 2>/dev/null",
        check=False, timeout=3
    )
    if result == "active":
        return True
    
    # Verificar si existe el socket (sin permisos especiales)
    try:
        socket_path = Path(f"/run/user/{uid}/docker.sock")
        if socket_path.exists():
            return True
    except PermissionError:
        pass
    
    return False


def get_container_uid(username):
    """Calcula el Container UID basado en subuid."""
    result = run_cmd(f"grep '^{username}:' /etc/subuid | head -1", check=False)
    if result:
        parts = result.split(':')
        if len(parts) >= 2:
            try:
                base = int(parts[1])
                return base + 999
            except ValueError:
                pass
    return None


def main():
    users = get_home_users()
    
    print("=" * 70)
    print(f"{'Usuario':<15} {'Subuid':<20} {'Linger':<8} {'Docker':<10} {'Container UID'}")
    print("=" * 70)
    
    for user in users:
        uid = run_cmd(f"id -u {user} 2>/dev/null", check=False)
        if not uid:
            continue
            
        subuid = check_subuid(user)
        linger = "✅" if check_linger(user) else "❌"
        docker = "✅" if check_docker_rootless(user, uid) else "❌"
        container_uid = get_container_uid(user)
        
        subuid_str = subuid if subuid else "❌"
        container_str = str(container_uid) if container_uid else "-"
        
        print(f"{user:<15} {subuid_str:<20} {linger:<8} {docker:<10} {container_str}")
    
    print("=" * 70)
    
    # Sugerir siguiente rango disponible
    existing_ranges = []
    subuid_content = run_cmd("cat /etc/subuid 2>/dev/null", check=False)
    if subuid_content:
        for line in subuid_content.split('\n'):
            if ':' in line:
                parts = line.split(':')
                if len(parts) >= 2:
                    try:
                        existing_ranges.append(int(parts[1]))
                    except ValueError:
                        pass
    
    if existing_ranges:
        next_base = ((max(existing_ranges) // 100000) + 1) * 100000
        print(f"\n💡 Siguiente rango disponible: {next_base}-{next_base + 65535}")
        print(f"   Container UID sería: {next_base + 999}")


if __name__ == "__main__":
    main()
