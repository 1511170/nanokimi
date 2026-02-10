# Guía Completa: Configuración OAuth + Docker para NanoKimi

Esta guía documenta la configuración completa de NanoKimi con autenticación OAuth de Kimi Code y Docker Rootless en un VPS Ubuntu.

## 📋 Requisitos Previos

- VPS con Ubuntu 22.04/24.04
- Docker Rootless configurado
- Node.js 22+ y npm
- Cuenta en Kimi (kimi.com) con acceso a Kimi Code

## 🏗️ Arquitectura de Mounts

La configuración correcta de mounts es crítica para que OAuth funcione:

```
Host (~/nanokimi/data/)          →  Contenedor (/home/node/.kimi/)
─────────────────────────────────────────────────────────────────────
credentials/config.toml          →  config.toml          (read-only)
credentials/kimi-code.json       →  credentials/kimi-code.json  (read-write)
sessions/<group>/                →  sessions/            (read-write)
```

**Importante:** El config.toml se monta como archivo individual, no como directorio, para evitar conflictos con las sesiones.

## 🔧 Paso 1: Configurar Kimi CLI Localmente

En tu máquina local (con navegador):

```bash
# 1. Instalar Kimi CLI si no lo tienes
pip install kimi-cli

# 2. Crear configuración correcta
cat > ~/.kimi/config.toml << 'EOF'
default_model = "kimi-code"
default_thinking = false
default_yolo = true

[models.kimi-code]
provider = "managed:kimi-code"
model = "kimi-latest"
max_context_size = 200000
capabilities = ["thinking"]

[providers."managed:kimi-code"]
type = "kimi"
base_url = "https://api.kimi.com/coding/v1"
api_key = ""
oauth = { storage = "file", key = "oauth/kimi-code" }
EOF

# 3. Autenticar con OAuth
kimi login
# Se abrirá navegador, autoriza el dispositivo

# 4. Verificar token
cat ~/.kimi/credentials/kimi-code.json
```

## 🚀 Paso 2: Configurar VPS

### 2.1 Clonar y preparar el repositorio

```bash
git clone https://github.com/tu-usuario/nanokimi.git
cd nanokimi

# Cambiar al branch con los fixes
git checkout fix/oauth-docker-mounts
```

### 2.2 Configurar directorios de datos

```bash
# Crear estructura de directorios
mkdir -p data/credentials
mkdir -p data/sessions/main
mkdir -p store/auth

# Copiar token OAuth desde tu máquina local
scp ~/.kimi/credentials/kimi-code.json usuario@vps:~/nanokimi/data/credentials/
scp ~/.kimi/config.toml usuario@vps:~/nanokimi/data/credentials/

# Configurar permisos (ACLs para Docker Rootless)
chmod 664 data/credentials/kimi-code.json
setfacl -m u:$(id -u):rw data/credentials/kimi-code.json
# Nota: El UID específico depende de tu configuración de Docker Rootless
```

### 2.3 Configurar variables de entorno

```bash
cat > .env << 'EOF'
# WhatsApp
MOONSHOT_API_KEY=your_api_key_here

# Asistente
ASSISTANT_NAME=Kai

# Opcional: Configuración adicional
LOG_LEVEL=info
EOF
```

### 2.4 Construir el contenedor

```bash
# Construir imagen Docker
docker build -t nanokimi-agent:latest container/

# Compilar código TypeScript
npm install
npm run build
```

## 📱 Paso 3: Autenticar WhatsApp

```bash
npm run auth

# Escanea el QR code con WhatsApp de tu teléfono:
# 1. Abre WhatsApp
# 2. Menú ⋮ → "Dispositivos vinculados"
# 3. "Vincular un dispositivo"
# 4. Escanea el código QR
```

## 🎯 Paso 4: Configurar Canal Principal

```bash
# Configurar tu número como canal principal
npm run setup

# Selecciona tu chat personal cuando te lo pida
```

## ▶️ Paso 5: Iniciar el Servicio

```bash
# Iniciar con systemd (recomendado)
systemctl --user start nanokimi
systemctl --user enable nanokimi

# O iniciar manualmente
npm start
```

## 🧪 Paso 6: Probar

Envíate un mensaje por WhatsApp:

```
@Kai Hola, ¿cómo estás?
```

Deberías recibir una respuesta del agente.

## 🔍 Solución de Problemas

### Error: "LLM is not set"

**Causa:** El modelo en el agent-runner no coincide con el config.toml.

**Solución:** Verificar que `container/agent-runner/src/index.ts` use `model: 'kimi-code'`.

### Error: "Read-only file system" al refrescar token

**Causa:** Los permisos del archivo de credenciales no permiten escritura.

**Solución:**
```bash
chmod 664 data/credentials/kimi-code.json
setfacl -m u:$(id -u):rw data/credentials/kimi-code.json
```

### Error: "Invalid Authentication" (401)

**Causa:** Token OAuth expirado.

**Solución:**
```bash
# En tu máquina local
kimi login

# Copiar token renovado
scp ~/.kimi/credentials/kimi-code.json usuario@vps:~/nanokimi/data/credentials/
```

### Error: "conflict type=replaced" en WhatsApp

**Causa:** Hay otra sesión de WhatsApp conectada.

**Solución:**
```bash
# Limpiar sesión anterior
rm -rf store/auth/creds.json

# Reintentar
npm run auth
```

## 📁 Estructura de Archivos Importantes

```
~/nanokimi/
├── data/
│   ├── credentials/
│   │   ├── config.toml          # Configuración Kimi CLI
│   │   └── kimi-code.json       # Token OAuth (se refresca automáticamente)
│   └── sessions/
│       └── main/                # Sesiones de conversación
├── groups/
│   ├── main/KIMI.md             # Prompt del asistente
│   └── global/KIMI.md           # Prompt global
├── store/
│   └── auth/
│       └── creds.json           # Credenciales WhatsApp
├── container/
│   ├── Dockerfile               # Imagen del agente
│   └── agent-runner/            # Código del agente
├── src/
│   ├── container-runner.ts      # Lógica de mounts Docker
│   └── config.ts                # Configuración del asistente
└── docs/
    └── OAUTH_DOCKER_SETUP.md    # Esta guía
```

## 🔄 Renovación Automática del Token

El Kimi CLI maneja automáticamente el refresh del token OAuth. Cuando el token está a punto de expirar, el CLI:

1. Detecta que el token expira en < 5 minutos
2. Usa el refresh_token para obtener un nuevo access_token
3. Guarda el nuevo token en `credentials/kimi-code.json`

**Nota:** El archivo debe tener permisos de escritura para que esto funcione.

## 🛡️ Seguridad

### Permisos Recomendados

```bash
# Token OAuth - solo owner y contenedor pueden leer/escribir
chmod 600 data/credentials/kimi-code.json
setfacl -m u:<docker-uid>:rw data/credentials/kimi-code.json

# Config - solo lectura
chmod 644 data/credentials/config.toml

# Sesiones - read-write para contenedor
chmod 755 data/sessions/main
```

### Variables de Entorno Sensibles

Nunca commitear el archivo `.env`. Está en `.gitignore` por defecto.

## 📝 Cambios Clave en el Código

### 1. container-runner.ts

- Agregar mounts para `config.toml` y `credentials/`
- Cambiar mount de sesiones de `.kimi/` a `.kimi/sessions/`
- Permitir escritura en credenciales para refresh OAuth

### 2. agent-runner/src/index.ts

- Cambiar modelo de `'kimi-latest'` a `'kimi-code'`
- Agregar parsing de eventos de sesión
- Mejorar manejo de mensajes tipo ContentPart

### 3. Dockerfile

- Cambiar base a `python:3.12-slim-bookworm`
- Instalar Node.js manualmente
- Crear usuario `node` con UID 1000
- Instalar `kimi-cli` con pip

### 4. config.ts

- Cambiar default de `'Kinto'` a `'Kai'`

## 🤝 Contribuir

Si encuentras mejoras o fixes, por favor:

1. Crea un branch: `git checkout -b fix/descripcion`
2. Haz tus cambios
3. Actualiza esta documentación
4. Crea un PR con descripción detallada

## 📚 Recursos Adicionales

- [Documentación Kimi Code](https://platform.moonshot.cn)
- [Docker Rootless Docs](https://docs.docker.com/engine/security/rootless/)
- [WhatsApp Web.js](https://github.com/pedroslopez/whatsapp-web.js)

---

**Última actualización:** 9 de febrero de 2025
