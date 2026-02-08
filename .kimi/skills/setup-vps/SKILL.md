---
name: setup-vps
description: Configure Docker Rootless para usuarios en VPS Ubuntu para NanoKimi. Usar cuando se necesite configurar un usuario nuevo con Docker Rootless, verificar estado de configuración VPS, o reemplaza el uso del script scripts/setup-vps.sh. Triggers setup-vps, vps-setup, configurar vps, docker rootless setup.
---

# VPS Docker Rootless Setup para NanoKimi

Skill para configurar y gestionar Docker Rootless en VPS Ubuntu para múltiples usuarios de NanoKimi.

**Nota:** Esta skill reemplaza el script legacy `scripts/setup-vps.sh`. Proporciona detección automática de estado y configuración incremental.

## Comandos disponibles

### `/setup-vps [usuario]`
Configura Docker Rootless para un usuario específico.
- Si no se especifica usuario, preguntar cuál o mostrar estado actual
- Detectar automáticamente qué pasos faltan
- Solo ejecuta los pasos pendientes (no repite configuración)
- Mostrar resumen al finalizar con Container UID

### `/vps-status`
Muestra el estado de configuración de todos los usuarios en `/home`.

## Procedimiento de configuración

### Paso 1: Verificar estado actual
Para cada usuario a configurar, ejecutar:
```bash
# ¿Usuario existe?
id USUARIO

# ¿Tiene subuid configurado?
grep "^USUARIO:" /etc/subuid

# ¿Tiene linger habilitado?
ls -la /var/lib/systemd/linger/USUARIO

# ¿Docker rootless activo? (verificar socket existe)
ls -la /run/user/$(id -u USUARIO)/docker.sock 2>/dev/null || echo "No activo"
```

### Paso 2: Crear usuario si no existe
```bash
sudo useradd -m -r -s /bin/bash USUARIO
sudo chmod 700 /home/USUARIO
```

### Paso 3: Asignar rango subuid/subgid
Determinar el siguiente rango disponible (>300000 para evitar conflictos):
```bash
# Ver rangos existentes
cat /etc/subuid

# Asignar nuevo rango (ejemplo: 400000-465535)
sudo usermod --add-subuids 400000-465535 --add-subgids 400000-465535 USUARIO
```

**Rangos comunes usados:**
- kinto: 100000-165535
- kintoai: 200000-265535
- camilo: 300000-365535
- Siguiente: 400000-465535, etc.

### Paso 4: Habilitar linger
```bash
sudo loginctl enable-linger USUARIO
```

### Paso 5: Instalar dependencias del sistema (si faltan)
```bash
sudo apt-get update
sudo apt-get install -y acl uidmap dbus-user-session fuse-overlayfs slirp4netns curl ca-certificates

# Docker CE + rootless extras
if ! command -v docker &>/dev/null; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-ce-rootless-extras
fi
```

### Paso 6: Configurar Docker Rootless
Ejecutar como el usuario objetivo:
```bash
sudo -u USUARIO bash -c '
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
  export PATH="/usr/bin:$PATH"
  dockerd-rootless-setuptool.sh install
'
```

### Paso 7: Verificar instalación
```bash
sudo -u USUARIO bash -c '
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  docker ps
'
```

### Paso 8: Calcular y mostrar Container UID
```bash
SUBUID_BASE=$(grep "^USUARIO:" /etc/subuid | head -1 | cut -d: -f2)
CONTAINER_UID=$((SUBUID_BASE + 999))
echo "Container UID para 'USUARIO': $CONTAINER_UID"
echo "  (subuid base $SUBUID_BASE + 999 para usuario 'node' uid 1000 dentro del contenedor)"
```

## Flujo de diagnóstico

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| "User does not exist" | Usuario no creado | `useradd -m -r -s /bin/bash USUARIO` |
| "permission denied" al ejecutar docker | Sin subuid/subgid | `usermod --add-subuids/--add-subgids` |
| "failed to start daemon" | Sin linger | `loginctl enable-linger` |
| "Cannot connect to Docker daemon" | Docker no iniciado | `systemctl --user start docker` |
| Contenedor no puede escribir volúmenes | UID mapping incorrecto | Verificar Container UID con `stat` |

## Uso típico en NanoKimi

### Configurar nuevo usuario para NanoKimi:
```
/setup-vps nanokimi
```

### Ver estado de todos los usuarios:
```
/vps-status
```

### Configurar segundo usuario (para otro proyecto):
```
/setup-vps proyecto2
```

## Post-configuración

Después de configurar el usuario con esta skill, el flujo continúa:

1. SSH como el nuevo usuario: `ssh USUARIO@tu-vps`
2. Clonar NanoKimi: `git clone https://github.com/.../nanokimi.git`
3. Entrar al directorio: `cd nanokimi`
4. Iniciar Kimi: `kimi`
5. Ejecutar: `/deploy`
