---
name: fast-setup
description: Configura un usuario de NanoKimi completamente desde un usuario sudo sin necesidad de cambiar de sesión ni hacer SSH. Instala Docker Rootless, Kimi CLI, clona el repo y deja todo listo para solo hacer WhatsApp auth. Triggers fast-setup, setup rapido, instalar usuario, full setup.
---

# Fast Setup - Configuración Completa desde Sudo

Configura un usuario de NanoKimi de una sola vez desde tu sesión sudo actual. No necesitas cambiar de usuario ni hacer SSH - todo se ejecuta remotamente con `su - usuario -c "..."`.

**Ideal para:**
- Configurar múltiples usuarios rápidamente
- Automatizar setups en VPS
- Evitar el "cambio de contexto" entre usuarios

---

## Uso

```
/fast-setup [nombre-usuario] [repo-url]
```

Ejemplos:
```
/fast-setup
/fast-setup nanokimi
/fast-setup cliente1 https://github.com/otro/nanokimi.git
```

---

## Procedimiento

### Paso 0: Detectar/Confirmar Usuario

Si no se especificó usuario, preguntar:
> ¿Qué nombre de usuario quieres crear para NanoKimi? (ej: nanokimi)

### Paso 1: Crear Usuario

Verificar si existe, si no, crearlo:

```bash
id USUARIO &>/dev/null && echo "Existe" || echo "No existe"
```

Si no existe:
```bash
sudo useradd -m -r -s /bin/bash USUARIO
sudo chmod 700 /home/USUARIO
```

### Paso 2: Instalar Docker (si falta)

```bash
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
```

### Paso 3: Configurar subuid/subgid y linger

Determinar siguiente rango disponible:

```bash
# Ver rangos existentes
sudo cat /etc/subuid

# Asignar rango (ej: 300000-365535)
sudo usermod --add-subuids 300000-365535 --add-subgids 300000-365535 USUARIO
sudo loginctl enable-linger USUARIO
```

### Paso 4: Instalar Docker Rootless (como el usuario)

```bash
sudo su - USUARIO -c '
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  dockerd-rootless-setuptool.sh install
' 2>&1 || echo "Docker rootless ya estaba configurado"
```

### Paso 5: Instalar Kimi CLI (como el usuario)

**IMPORTANTE:** Limpiar `~/.local` si tiene malos permisos antes de instalar.

```bash
sudo su - USUARIO -c '
  # Limpiar .local si pertenece a otro
  if [ -d "$HOME/.local" ] && [ "$(stat -c "%U" "$HOME/.local" 2>/dev/null)" != "$(whoami)" ]; then
    echo "Limpiando ~/.local con permisos incorrectos..."
    rm -rf "$HOME/.local"
  fi
  
  # Instalar kimi
  curl -L code.kimi.com/install.sh | bash
  
  # Verificar
  source $HOME/.local/bin/env
  which kimi && echo "✓ Kimi instalado"
'
```

### Paso 6: Clonar Repo y Setup NPM

```bash
REPO_URL="https://github.com/1511170/nanokimi.git"  # o el que el usuario especificó

sudo su - USUARIO -c "
  source \$HOME/.local/bin/env
  
  if [ -d nanokimi ]; then
    echo 'Actualizando repo...'
    cd nanokimi && git pull
  else
    git clone '$REPO_URL' nanokimi
    cd nanokimi
  fi
  
  npm install
  npm run build
  mkdir -p groups data store logs
  echo '✓ Proyecto listo'
"
```

### Paso 7: Configurar ACLs

```bash
SUBUID_BASE=$(sudo grep "^USUARIO:" /etc/subuid | head -1 | cut -d: -f2)
CONTAINER_UID=$((SUBUID_BASE + 999))

sudo su - USUARIO -c "
  cd nanokimi
  for dir in groups data store; do
    setfacl -R -m u:$CONTAINER_UID:rwx \$dir 2>/dev/null || true
    setfacl -R -d -m u:$CONTAINER_UID:rwx \$dir 2>/dev/null || true
  done
  echo '✓ ACLs configuradas'
"
```

### Paso 8: API Key (preguntar al admin)

Preguntar:
> ¿Quieres configurar la API key de Moonshot AI ahora, o prefieres que el usuario la configure después?
> 
> - **Ahora** (más rápido, pero yo veré la key)
> - **Después** (más seguro, el usuario la configura)

**Si elige "Ahora":**
> Pega tu API key de Moonshot AI (https://platform.moonshot.cn/):

```bash
# Guardar key proporcionada
sudo su - USUARIO -c "echo 'MOONSHOT_API_KEY=KEY_PROPORCIONADA' > nanokimi/.env"
```

**Si elige "Después":**
> OK. El usuario deberá crear el archivo `.env` con:
> ```
> MOONSHOT_API_KEY='tu-api-key'
> ```

---

## Resumen Final

Mostrar al usuario:

```
✅ Setup completo para: USUARIO

📍 Ruta del proyecto: /home/USUARIO/nanokimi
🐳 Container UID: CONTAINER_UID
🤖 Kimi CLI: /home/USUARIO/.local/bin/kimi

Próximos pasos (ejecutar desde tu sesión sudo actual):

1️⃣  WhatsApp Auth (QR aparecerá aquí):
    sudo su - USUARIO -c 'cd nanokimi && npm run auth'

2️⃣  Iniciar servicio:
    sudo su - USUARIO -c 'cd nanokimi && systemctl --user start nanokimi'

3️⃣  Ver logs:
    sudo su - USUARIO -c 'tail -f nanokimi/logs/nanokimi.log'

O entra como el usuario:
    sudo su - USUARIO
    cd nanokimi && kimi
```

---

## Comandos Útiles Post-Setup

### Verificar estado del usuario

```bash
sudo su - USUARIO -c '
  echo "=== Kimi ===" && which kimi
  echo "=== Docker ===" && docker ps
  echo "=== Proyecto ===" && ls -la nanokimi/
'
```

### Reiniciar servicio

```bash
sudo su - USUARIO -c 'cd nanokimi && systemctl --user restart nanokimi'
```

### Ver logs en tiempo real

```bash
sudo su - USUARIO -c 'tail -f nanokimi/logs/nanokimi.log'
```

---

## Troubleshooting

### "cannot access $HOME/.local: Permission denied"

El directorio `~/.local` fue creado por otro usuario. La skill ya lo limpia automáticamente, pero si persiste:

```bash
sudo rm -rf /home/USUARIO/.local
# Re-ejecutar paso 5
```

### "docker: command not found" como el usuario

Docker Rootless no está instalado o no está en el PATH:

```bash
sudo su - USUARIO -c '
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  dockerd-rootless-setuptool.sh install
  echo "export PATH=/usr/bin:\$PATH" >> ~/.bashrc
'
```

### "kimi: command not found" después de instalar

Verificar que `~/.local/bin` está en PATH:

```bash
sudo su - USUARIO -c '
  source $HOME/.local/bin/env
  which kimi
'
```

---

## Comparación con Setup Normal

| Aspecto | Setup Normal (`/setup-vps`) | Fast Setup (`/fast-setup`) |
|---------|----------------------------|---------------------------|
| Sesión | Cambiar entre sudo → usuario | Todo desde sudo |
| Kimi CLI | Usuario lo instala manual | Admin lo instala vía `su` |
| WhatsApp Auth | Usuario corre `npm run auth` | Admin puede hacerlo remoto |
| Ideal para | Setup manual detallado | Automatización, múltiples usuarios |

---

## Notas de Seguridad

- El admin puede ver la API key si la configura en paso 8
- Considera dejar que el usuario configure `.env` para mayor seguridad
- `chmod 700 /home/usuario` mantiene aislamiento entre usuarios
