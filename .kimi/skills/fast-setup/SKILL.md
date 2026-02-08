---
name: fast-setup
description: Configura un usuario de NanoKimi completamente desde sudo. Primero hace la configuración de sistema (Docker Rootless), luego entra como el usuario e instala Kimi CLI, clona el repo y deja todo listo. Triggers fast-setup, setup rapido, instalar usuario, full setup sudo.
---

# Fast Setup - Configuración Completa desde Sudo

Configura un usuario de NanoKimi de una sola vez desde tu sesión sudo. 

**Flujo:**
1. **Fase Sudo** (como root): Docker, subuid/subgid, linger, dependencias del sistema
2. **Fase Usuario** (con `su - usuario`): Kimi CLI, git clone, npm install, ACLs

No necesitas cambiar manualmente de usuario - la skill hace `sudo su - usuario` automáticamente para la segunda fase.

---

## Uso

```
/fast-setup [nombre-usuario] [repo-url]
```

Ejemplo:
```
/fast-setup nanokimi
/fast-setup cliente1 https://github.com/otro/nanokimi.git
```

---

## Fase 1: Configuración de Sistema (como root)

### Paso 1: Detectar/Confirmar Usuario

Si no se especificó usuario, preguntar:
> ¿Qué nombre de usuario quieres crear para NanoKimi? (ej: nanokimi)

Verificar si existe:
```bash
id USUARIO &>/dev/null && echo "Existe" || echo "No existe"
```

Si no existe, crearlo:
```bash
sudo useradd -m -r -s /bin/bash USUARIO
sudo chmod 700 /home/USUARIO
```

### Paso 2: Instalar Dependencias del Sistema

```bash
sudo apt-get update
sudo apt-get install -y git nodejs npm acl uidmap dbus-user-session fuse-overlayfs slirp4netns curl ca-certificates
```

### Paso 3: Instalar Docker CE (si falta)

```bash
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi

# Asegurar que rootless extras esté instalado
sudo apt-get install -y docker-ce-rootless-extras
```

### Paso 4: Configurar subuid/subgid

Determinar siguiente rango disponible (empezar en 300000+):

```bash
# Ver rangos existentes
sudo cat /etc/subuid

# Asignar rango si no tiene
if ! grep -q "^USUARIO:" /etc/subuid 2>/dev/null; then
  sudo usermod --add-subuids 300000-365535 --add-subgids 300000-365535 USUARIO
fi

# Habilitar linger
sudo loginctl enable-linger USUARIO
```

### Paso 5: Instalar Docker Rootless

**Ejecutar como el usuario objetivo** (esto requiere ser root para el setup inicial):

```bash
sudo su - USUARIO -c '
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  dockerd-rootless-setuptool.sh install
' 2>&1 || echo "Docker rootless ya estaba configurado o continuará..."
```

Verificar que funciona:
```bash
sudo su - USUARIO -c 'docker ps'
```

---

## Fase 2: Configuración como el Usuario

**Ahora entramos completamente como el usuario** y hacemos todo lo demás desde ahí.

Cambiar a la sesión del usuario:
```bash
sudo su - USUARIO
```

> ℹ️ Ahora estás ejecutando comandos **como el usuario USUARIO**, no como root.

### Paso 6: Instalar Kimi CLI

```bash
# Limpiar .local si tiene malos permisos de otro usuario
if [ -d "$HOME/.local" ] && [ "$(stat -c '%U' "$HOME/.local" 2>/dev/null)" != "$(whoami)" ]; then
  echo "Limpiando ~/.local con permisos incorrectos..."
  rm -rf "$HOME/.local"
fi

# Instalar kimi
curl -L code.kimi.com/install.sh | bash
source $HOME/.local/bin/env

# Verificar
which kimi && echo "✓ Kimi CLI instalado: $(kimi --version 2>/dev/null || echo 'OK')"
```

### Paso 7: Clonar Repo y Setup

```bash
REPO_URL="https://github.com/1511170/nanokimi.git"  # o el especificado

if [ -d nanokimi ]; then
  echo "Actualizando repo..."
  cd nanokimi && git pull
else
  git clone "$REPO_URL" nanokimi
  cd nanokimi
fi

# Instalar dependencias y build
npm install
npm run build

# Crear directorios
mkdir -p groups data store logs
```

### Paso 8: Configurar ACLs

```bash
cd nanokimi

# Calcular Container UID
SUBUID_BASE=$(grep "^$(whoami):" /etc/subuid | head -1 | cut -d: -f2)
CONTAINER_UID=$((SUBUID_BASE + 999))

# Aplicar ACLs
for dir in groups data store; do
  setfacl -R -m u:$CONTAINER_UID:rwx "$dir" 2>/dev/null || true
  setfacl -R -d -m u:$CONTAINER_UID:rwx "$dir" 2>/dev/null || true
done

echo "✓ ACLs configuradas para Container UID: $CONTAINER_UID"
```

---

## Paso 9: API Key

Preguntar al admin (que ahora está en la sesión del usuario o puede decidir):
> ¿Quieres configurar la API key de Moonshot AI ahora?
> 
> 1. **Sí, configurar ahora** (desde esta sesión)
> 2. **No, el usuario lo hará después** (más seguro)

**Si elige configurar ahora:**
> Pega tu API key de Moonshot AI (https://platform.moonshot.cn/):

```bash
cd ~/nanokimi
read -s API_KEY
echo "MOONSHOT_API_KEY='$API_KEY'" > .env
echo "✓ API key configurada"
```

**Si elige no configurar:**
> OK. El usuario deberá crear el archivo `.env`:
> ```
> MOONSHOT_API_KEY='tu-api-key'
> ```

---

## Resumen Final

Una vez completado, mostrar:

```
✅ Setup completo para: USUARIO

📍 Proyecto: /home/USUARIO/nanokimi
🐳 Container UID: XXXXXX
🤖 Kimi: $(which kimi)

Próximos pasos:

Desde tu sesión sudo actual, puedes:

1️⃣  WhatsApp Auth (mostrará QR aquí):
    sudo su - USUARIO -c 'cd nanokimi && npm run auth'

2️⃣  O entrar completamente como el usuario:
    sudo su - USUARIO
    cd nanokimi
    npm run auth  # Escanea QR
    systemctl --user start nanokimi
```

---

## Flujo Alternativo: Todo Automatizado

Si el admin quiere automatizar TODO sin interactividad, puede ejecutar:

```bash
# Fase sudo (como root)
sudo bash -c '
  USER=nanokimi
  id $USER || useradd -m -r -s /bin/bash $USER
  curl -fsSL https://get.docker.com | sh
  usermod --add-subuids 300000-365535 --add-subgids 300000-365535 $USER
  loginctl enable-linger $USER
  su - $USER -c "dockerd-rootless-setuptool.sh install" || true
'

# Fase usuario (entrar como el usuario)
sudo su - nanokimi << 'EOF'
  curl -L code.kimi.com/install.sh | bash
  source $HOME/.local/bin/env
  git clone https://github.com/1511170/nanokimi.git
  cd nanokimi
  npm install && npm run build
  mkdir -p groups data store
  SUBUID=$(grep "^$(whoami):" /etc/subuid | cut -d: -f2)
  for d in groups data store; do
    setfacl -R -m u:$((SUBUID+999)):rwx $d 2>/dev/null || true
  done
  echo "Listo. Configura .env y corre: npm run auth"
EOF
```

---

## Troubleshooting

### Error: "cannot access $HOME/.local: Permission denied"

Otro usuario creó `~/.local`. Limpiar:
```bash
sudo rm -rf /home/USUARIO/.local
# Reintentar instalación de kimi
```

### Error: "docker: command not found" como el usuario

Docker Rootless no está en el PATH. Agregar a `.bashrc`:
```bash
echo 'export PATH=/usr/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Verificar Container UID correcto

```bash
SUBUID_BASE=$(grep "^$(whoami):" /etc/subuid | head -1 | cut -d: -f2)
echo "Container UID: $((SUBUID_BASE + 999))"
```

---

## Comparación de Approaches

| | `/setup-vps` | `/fast-setup` (esta skill) |
|---|---|---|
| Quién ejecuta | Admin con sudo | Admin con sudo |
| Parte 1 | Configura sistema | **Sudo**: Docker, subuid, linger |
| Parte 2 | Usuario hace manualmente | **Entra como usuario**: kimi, npm, repo |
| Cambio de usuario | SSH manual | Automático con `su -` |
| Ideal para | Setup manual cuidadoso | **Setup rápido automatizado** |
