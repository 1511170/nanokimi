# Fast Sudo Setup - NanoKimi en Dos Fases

**Configura un usuario completo desde sudo: primero el sistema, luego entra como el usuario.**

Esta guía es para administradores que tienen acceso `sudo` y quieren preparar un usuario de NanoKimi sin tener que hacer SSH manual ni cambiar entre usuarios constantemente.

El truco está en dividir el proceso en **dos fases claras**:
1. **Fase Sudo** (como root): Docker, subuid/subgid, linger
2. **Fase Usuario** (con `su - usuario`): Kimi, git, npm, etc.

---

## ⚡ Comando Rápido (Todo en Uno)

```bash
# FASE 1: Como sudo - configuración de sistema
sudo bash -c '
  USERNAME=nanokimi
  
  # Crear usuario
  id $USERNAME || useradd -m -r -s /bin/bash $USERNAME
  chmod 700 /home/$USERNAME
  
  # Docker
  curl -fsSL https://get.docker.com | sh
  apt-get install -y docker-ce-rootless-extras
  
  # Subuid/subgid
  usermod --add-subuids 300000-365535 --add-subgids 300000-365535 $USERNAME
  loginctl enable-linger $USERNAME
  
  # Docker rootless como el usuario
  su - $USERNAME -c "dockerd-rootless-setuptool.sh install" || true
  
  echo "✓ Fase Sudo completa"
'

# FASE 2: Entrar como el usuario y hacer el resto
sudo su - nanokimi << 'EOF'
  # Instalar kimi (limpiar .local si es necesario)
  [ -d "$HOME/.local" ] && [ "$(stat -c '%U' "$HOME/.local')" != "$(whoami)" ] && rm -rf "$HOME/.local"
  curl -L code.kimi.com/install.sh | bash
  source $HOME/.local/bin/env
  
  # Clonar y setup
  git clone https://github.com/1511170/nanokimi.git
  cd nanokimi
  npm install && npm run build
  mkdir -p groups data store logs
  
  # ACLs
  SUBUID=$(grep "^$(whoami):" /etc/subuid | cut -d: -f2)
  for d in groups data store; do
    setfacl -R -m u:$((SUBUID+999)):rwx $d 2>/dev/null || true
  done
  
  echo "✓ Fase Usuario completa"
  echo "Ahora configura .env y corre: npm run auth"
EOF
```

---

## Paso a Paso Detallado

### FASE 1: Configuración de Sistema (como sudo)

#### 1. Crear usuario

```bash
USERNAME=nanokimi

# Crear si no existe
sudo id $USERNAME || sudo useradd -m -r -s /bin/bash $USERNAME
sudo chmod 700 /home/$USERNAME
```

#### 2. Instalar Docker

```bash
# Instalar Docker CE
sudo curl -fsSL https://get.docker.com | sh
sudo apt-get install -y docker-ce-rootless-extras
```

#### 3. Configurar subuid/subgid

```bash
# Asignar rango si no tiene
if ! sudo grep -q "^$USERNAME:" /etc/subuid 2>/dev/null; then
  sudo usermod --add-subuids 300000-365535 --add-subgids 300000-365535 $USERNAME
fi

# Habilitar linger (necesario para systemd --user)
sudo loginctl enable-linger $USERNAME
```

#### 4. Instalar Docker Rootless

```bash
# Ejecutar como el usuario objetivo
sudo su - $USERNAME -c 'dockerd-rootless-setuptool.sh install'

# Verificar que funciona
sudo su - $USERNAME -c 'docker ps'
```

✅ **Fase 1 completa**. Ahora pasa a la Fase 2.

---

### FASE 2: Configuración como el Usuario

**Ahora "entramos" como el usuario** con `sudo su - usuario`. Esto inicia una shell completamente nueva como ese usuario.

```bash
sudo su - $USERNAME
```

> 💡 Ahora estás ejecutando comandos **como el usuario objetivo**, no como root.

#### 5. Instalar Kimi CLI

```bash
# Verificar/limpiar ~/.local si tiene malos permisos
if [ -d "$HOME/.local" ] && [ "$(stat -c '%U' "$HOME/.local'" 2>/dev/null)" != "$(whoami)" ]; then
  echo "Limpiando ~/.local..."
  rm -rf "$HOME/.local"
fi

# Instalar kimi
curl -L code.kimi.com/install.sh | bash
source $HOME/.local/bin/env

# Verificar
which kimi
```

#### 6. Clonar Repo y Setup

```bash
# Clonar
git clone https://github.com/1511170/nanokimi.git
cd nanokimi

# Dependencias y build
npm install
npm run build

# Directorios necesarios
mkdir -p groups data store logs
```

#### 7. Configurar ACLs

```bash
# Calcular Container UID (subuid_base + 999)
SUBUID_BASE=$(grep "^$(whoami):" /etc/subuid | head -1 | cut -d: -f2)
CONTAINER_UID=$((SUBUID_BASE + 999))

# Aplicar ACLs para que el contenedor pueda escribir
for dir in groups data store; do
  setfacl -R -m u:$CONTAINER_UID:rwx "$dir"
  setfacl -R -d -m u:$CONTAINER_UID:rwx "$dir"
done

echo "Container UID: $CONTAINER_UID"
```

#### 8. Configurar API Key

```bash
# Crear archivo .env
echo "MOONSHOT_API_KEY='tu-api-key-aqui'" > .env
```

✅ **Fase 2 completa**. Ahora tienes:
- Kimi CLI instalado
- Repo clonado y compilado
- Docker rootless funcionando
- ACLs configuradas

---

## WhatsApp Auth (Interactivo)

Puedes hacer el auth de WhatsApp sin salir de tu sesión sudo:

```bash
# Desde tu sesión sudo original:
sudo su - nanokimi -c 'cd nanokimi && npm run auth'

# Aparece el QR, lo escaneas con WhatsApp, listo.
```

O si ya hiciste `sudo su - nanokimi`:

```bash
cd nanokimi
npm run auth
```

---

## Iniciar el Servicio

```bash
# Opción A: Desde tu sesión sudo (sin cambiar de usuario)
sudo su - nanokimi -c 'cd nanokimi && systemctl --user start nanokimi'

# Opción B: Entrando como el usuario
sudo su - nanokimi
cd nanokimi
systemctl --user start nanokimi
```

Ver logs:
```bash
sudo su - nanokimi -c 'tail -f nanokimi/logs/nanokimi.log'
```

---

## ¿Por qué dividir en dos fases?

| Fase | Comando | Qué hace | Por qué separado |
|------|---------|----------|------------------|
| **1 - Sudo** | `sudo ...` | Docker, subuid, linger | Requiere privilegios de root |
| **2 - Usuario** | `sudo su - usuario` | Kimi, npm, git clone | No requiere root, mejor seguridad |

**Ventajas de esta división:**
- ✅ Claro qué necesita root y qué no
- ✅ El usuario final "posee" todos sus archivos (no root)
- ✅ Mejor auditoría de seguridad
- ✅ Si algo falla en Fase 2, no afectó el sistema

---

## Comandos de Verificación

### Verificar que todo quedó bien

```bash
# Como sudo, verificar estado del usuario
sudo su - nanokimi -c '
  echo "=== Usuario ===" && whoami && id
  echo "=== Kimi ===" && which kimi && kimi --version 2>/dev/null
  echo "=== Docker ===" && docker ps 2>/dev/null && echo "OK" || echo "Docker no activo"
  echo "=== Proyecto ===" && ls -la ~/nanokimi/ | head -5
  echo "=== Container UID ===" && echo $(($(grep "^$(whoami):" /etc/subuid | cut -d: -f2) + 999))
'
```

---

## Troubleshooting

### "cannot access $HOME/.local: Permission denied"

El directorio `~/.local` fue creado por otro usuario:

```bash
sudo rm -rf /home/USUARIO/.local
# Reintentar instalación de kimi
```

### "docker: command not found" como el usuario

Docker Rootless no está en el PATH. Agregar a `.bashrc`:

```bash
echo 'export PATH=/usr/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Permisos en grupos/data/store

Recalcular y re-aplicar ACLs:

```bash
sudo su - USUARIO -c '
  cd nanokimi
  SUBUID=$(grep "^$(whoami):" /etc/subuid | cut -d: -f2)
  for d in groups data store; do
    setfacl -R -m u:$((SUBUID+999)):rwx $d
    setfacl -R -d -m u:$((SUBUID+999)):rwx $d
  done
'
```

---

## Skill Disponible

Esta funcionalidad está disponible como skill en Kimi Code:

```
/fast-setup [usuario] [repo-url]
```

La skill guía automáticamente las dos fases:
1. Primero ejecuta todo lo que requiere sudo
2. Luego hace `su - usuario` y completa la instalación
3. Al final te dice exactamente qué comando usar para WhatsApp auth
