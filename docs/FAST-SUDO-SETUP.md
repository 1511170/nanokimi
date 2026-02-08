# Fast Sudo Setup - NanoKimi en una Sola Ejecución

**Para administradores que quieren configurar todo de una vez sin cambiar de usuario.**

Esta guía es para quienes tienen acceso `sudo` y quieren preparar un usuario de NanoKimi completamente desde su sesión actual, sin tener que hacer `ssh` o `su` manualmente entre usuarios.

---

## ⚡ Comando Rápido (TL;DR)

```bash
# Todo de una vez: crea usuario, instala docker, kimi, clona repo y deja listo
sudo bash -c '
  USERNAME=nanokimi
  
  # 1. Crear usuario
  id $USERNAME &>/dev/null || useradd -m -r -s /bin/bash $USERNAME
  chmod 700 /home/$USERNAME
  
  # 2. Docker Rootless (setup-vps básico)
  apt-get update -qq && apt-get install -y -qq curl ca-certificates
  curl -fsSL https://get.docker.com | sh
  usermod --add-subuids 300000-365535 --add-subgids 300000-365535 $USERNAME
  loginctl enable-linger $USERNAME
  
  # 3. Instalar Kimi CLI como el usuario
  su - $USERNAME -c "curl -L code.kimi.com/install.sh | bash"
  
  # 4. Clonar repo y setup
  su - $USERNAME -c "
    source \$HOME/.local/bin/env
    git clone https://github.com/1511170/nanokimi.git
    cd nanokimi
    npm install && npm run build
    mkdir -p groups data store
  "
  
  echo "✓ Listo! Usuario: $USERNAME"
  echo "  su - $USERNAME -c \"cd nanokimi && npm run auth\""
'
```

---

## 📋 Paso a Paso Detallado

### Paso 1: Crear el Usuario (como sudo)

```bash
USERNAME=nanokimi

# Crear si no existe
sudo id $USERNAME &>/dev/null || sudo useradd -m -r -s /bin/bash $USERNAME
sudo chmod 700 /home/$USERNAME
```

### Paso 2: Configurar Docker Rootless

```bash
# Instalar Docker
sudo apt-get update
sudo apt-get install -y curl ca-certificates
sudo curl -fsSL https://get.docker.com | sh

# Asignar subuid/subgid
sudo usermod --add-subuids 300000-365535 --add-subgids 300000-365535 $USERNAME
sudo loginctl enable-linger $USERNAME

# Instalar Docker Rootless como el usuario
sudo su - $USERNAME -c 'dockerd-rootless-setuptool.sh install'
```

### Paso 3: Instalar Kimi CLI (sin cambiar de usuario)

```bash
sudo su - $USERNAME -c 'curl -L code.kimi.com/install.sh | bash'
```

Esto instala `kimi` en `/home/$USERNAME/.local/bin` y evita problemas de permisos.

### Paso 4: Preparar el Proyecto

```bash
sudo su - $USERNAME -c '
  source $HOME/.local/bin/env
  git clone https://github.com/1511170/nanokimi.git
  cd nanokimi
  npm install
  npm run build
  mkdir -p groups data store logs
'
```

### Paso 5: Configurar API Key

```bash
# Opción A: El admin configura la API key
read -s API_KEY
sudo su - $USERNAME -c "echo \"MOONSHOT_API_KEY='$API_KEY'\" > nanokimi/.env"

# Opción B: El usuario lo hace después
# (más seguro, el admin no ve la key)
```

### Paso 6: WhatsApp Auth (interactivo)

El admin puede mostrar el QR sin hacer SSH:

```bash
sudo su - $USERNAME -c 'cd nanokimi && npm run auth'
# Escanea el QR que aparece
```

### Paso 7: Iniciar el Servicio

```bash
# Como el usuario, iniciar el servicio
sudo su - $USERNAME -c '
  cd nanokimi
  systemctl --user start docker
  systemctl --user enable --now nanokimi
'

# Ver logs
sudo su - $USERNAME -c 'tail -f nanokimi/logs/nanokimi.log'
```

---

## 🎯 Comparación: Setup Normal vs Fast Sudo

| | Setup Normal | Fast Sudo Setup |
|---|---|---|
| **Fase 1** | `sudo kimi` → `/setup-vps usuario` | Todo en una línea |
| **Cambio de usuario** | SSH manual o `su` | `su - usuario -c "..."` |
| **Instalar kimi** | Usuario entra y ejecuta curl | Admin lo hace con `su -c` |
| **WhatsApp Auth** | Usuario corre `npm run auth` | Admin puede hacerlo remoto |
| **Ideal para** | VPS nuevos | Configurar múltiples usuarios rápido |

---

## 🛠️ Script Automático

Guarda esto como `fast-setup.sh`:

```bash
#!/bin/bash
# Fast setup para NanoKimi - Ejecutar como sudo
set -e

USERNAME="${1:-nanokimi}"
REPO="${2:-https://github.com/1511170/nanokimi.git}"

echo "⚡ Fast Setup para: $USERNAME"

# Crear usuario
id "$USERNAME" &>/dev/null || useradd -m -r -s /bin/bash "$USERNAME"
chmod 700 "/home/$USERNAME"

# Docker
curl -fsSL https://get.docker.com | sh 2>/dev/null || true
usermod --add-subuids 300000-365535 --add-subgids 300000-365535 "$USERNAME"
loginctl enable-linger "$USERNAME"

# Kimi + Repo
su - "$USERNAME" -c "
  # Limpiar .local si tiene malos permisos
  [ -d \"\$HOME/.local\" ] && [ \"\$(stat -c '%U' '\$HOME/.local')\" != '\$(whoami)' ] && rm -rf '\$HOME/.local'
  
  # Instalar kimi
  curl -L code.kimi.com/install.sh | bash
  source \$HOME/.local/bin/env
  
  # Clonar y preparar
  git clone '$REPO' nanokimi
  cd nanokimi
  npm install && npm run build
  mkdir -p groups data store logs
"

SUBUID_BASE=$(grep "^$USERNAME:" /etc/subuid | head -1 | cut -d: -f2)
echo ""
echo "✓ Setup completo para: $USERNAME"
echo "  Container UID: $((SUBUID_BASE + 999))"
echo "  Proyecto: /home/$USERNAME/nanokimi"
echo ""
echo "Próximos pasos:"
echo "  1. Configurar API key: sudo su - $USERNAME -c 'echo MOONSHOT_API_KEY=xxx > nanokimi/.env'"
echo "  2. WhatsApp auth:     sudo su - $USERNAME -c 'cd nanokimi && npm run auth'"
echo "  3. Iniciar:           sudo su - $USERNAME -c 'cd nanokimi && systemctl --user start nanokimi'"
```

Uso:
```bash
sudo bash fast-setup.sh minuevo
```

---

## 🔑 Trucos Clave

### Ejecutar comandos como otro usuario sin cambiar de sesión

```bash
# Con su -
sudo su - usuario -c "comando"

# Con sudo -u (sin login shell)
sudo -u usuario bash -c "source \$HOME/.local/bin/env && kimi"

# Con variables de entorno
sudo -iu usuario <<< "cd nanokimi && kimi"
```

### Verificar que todo quedó bien

```bash
# ¿Kimi está instalado?
sudo su - usuario -c "which kimi"

# ¿Docker rootless funciona?
sudo su - usuario -c "docker ps"

# ¿El repo existe?
sudo ls -la /home/usuario/nanokimi
```

---

## ⚠️ Consideraciones de Seguridad

1. **API Keys**: El ver la API key del usuario como admin puede ser un riesgo. Considera dejar que el usuario configure `.env`.

2. **Historial de comandos**: Si pasas la API key por línea de comandos, quedará en el historial de bash del root.

3. **Permisos**: `chmod 700 /home/usuario` es crucial para mantener aislamiento entre usuarios.

---

## 💡 Cuándo Usar Esto

✅ **Ideal para:**
- Configurar múltiples usuarios rápidamente
- Scripts de automatización
- VPS donde tienes solo acceso root inicial

❌ **No ideal para:**
- Producción donde el admin no debe ver credenciales
- Equipos compartidos donde se requiere separación estricta
