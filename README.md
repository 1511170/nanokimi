<p align="center">
  <img src="assets/nanokimi-logo.png" alt="NanoKimi" width="400">
</p>

<p align="center">
  <strong>Tu asistente personal de Kimi AI que se ejecuta de forma segura en contenedores</strong>
</p>

<p align="center">
  <a href="#features">Características</a> •
  <a href="#installation">Instalación</a> •
  <a href="#usage">Uso</a> •
  <a href="#architecture">Arquitectura</a> •
  <a href="#security">Seguridad</a> •
  <a href="#faq">FAQ</a>
</p>

---

## 🎯 ¿Qué es NanoKimi?

**NanoKimi** es un asistente personal de IA basado en [Kimi Code](https://kimi.com) (de Moonshot AI) que se integra con **WhatsApp**. Diseñado con la filosofía "pequeño pero poderoso", ofrece:

- 🤖 **IA de última generación** mediante el SDK de Kimi Agent
- 💬 **Interfaz familiar** - usa WhatsApp desde tu teléfono
- 🔒 **Seguridad por aislamiento** - cada conversación corre en su propio contenedor Docker
- 🧠 **Memoria persistente** - recuerda contexto y preferencias por grupo
- ⏰ **Tareas programadas** - automatiza recordatorios y reportes
- 🛠️ **Personalizable** - modifica el código fácilmente para adaptarlo a tus necesidades

> **Nota:** Este proyecto es un fork adaptado de [NanoClaw](https://github.com/gavrielc/nanoclaw), modificado para usar Kimi Code en lugar de Claude Code.

---

## ✨ Características

### Core
- **📱 WhatsApp como interfaz** - Envía mensajes a tu asistente desde cualquier lugar
- **👥 Grupos aislados** - Cada grupo de WhatsApp tiene su propio contexto y memoria
- **🧠 Memoria jerárquica**
  - Memoria global (`groups/KIMI.md`) - compartida entre todos los grupos
  - Memoria por grupo (`groups/{nombre}/KIMI.md`) - específica de cada conversación
- **⏰ Tareas programadas** - Crea recordatorios recurrentes o de una sola vez
- **🌐 Acceso web** - Búsqueda y navegación integrada
- **🔧 Herramientas integradas** - Bash, edición de archivos, búsqueda, glob, grep

### Seguridad
- **🛡️ Aislamiento por contenedores** - Cada ejecución corre en un contenedor Docker fresco
- **📁 Acceso limitado** - Solo los directorios montados explícitamente son visibles
- **🔐 Credenciales protegidas** - Las API keys nunca se exponen a los agentes
- **👤 Ejecución no-root** - Los contenedores corren como usuario `node` (UID 1000)

### Integraciones (via Skills)
- **📧 Gmail** (`/add-gmail`) - Lee y envía emails
- **🔍 Parallel AI** (`/add-parallel`) - Investigación web avanzada
- **🎙️ Transcripción de voz** (`/add-voice-transcription`) - Convierte notas de voz a texto
- **🐦 X/Twitter** (`/x-integration`) - Publica y gestiona tweets

---

## 📋 Requisitos

| Requisito | macOS | Linux VPS |
|-----------|-------|-----------|
| Sistema Operativo | macOS 12+ | Ubuntu 22.04+ / Debian 12+ |
| Node.js | 20+ | 20+ |
| Docker | Docker Desktop | Docker Rootless |
| Kimi Code | `npm install -g kimi-cli` | `curl -L code.kimi.com/install.sh \| bash` |
| API Key | [Moonshot AI](https://platform.moonshot.cn) | [Moonshot AI](https://platform.moonshot.cn) |

---

## 🚀 Instalación

### Opción 1: macOS (Desarrollo Local)

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/nanokimi.git
cd nanokimi

# 2. Iniciar Kimi Code
kimi

# 3. En la interfaz de Kimi Code, ejecutar:
/setup
```

El comando `/setup` guiará el proceso completo:
- Verificación de dependencias
- Configuración de Docker
- Autenticación con Kimi (OAuth o API Key)
- Autenticación de WhatsApp (escanea QR)
- Construcción del contenedor
- Configuración del servicio launchd

### Opción 2: Linux VPS (Producción)

#### Fase 1: Administrador (con sudo)

Desde el VPS como usuario con privilegios sudo, inicia Kimi Code y usa la skill de configuración:

```bash
# Iniciar Kimi Code
kimi

# Dentro de Kimi, ejecutar:
/setup-vps nanokimi
```

Esto configurará automáticamente:
- Un usuario dedicado (ej: `nanokimi`)
- Docker Rootless (sin necesidad de root)
- Subuid/subgid mappings
- Linger para systemd --user
- Container UID para mapeo de volúmenes

La skill detecta automáticamente qué pasos faltan y solo configura lo necesario. También puedes verificar el estado de todos los usuarios con `/vps-status`.

#### Fase 2: Usuario de la aplicación

```bash
# Conectar como el usuario creado
ssh nanokimi@tu-vps

# Instalar Kimi Code (si no está instalado)
curl -L code.kimi.com/install.sh | bash
source $HOME/.local/bin/env

# Clonar y desplegar
git clone https://github.com/tu-usuario/nanokimi.git
cd nanokimi

# Iniciar Kimi Code y ejecutar el deploy
kimi
# Luego ejecutar: /deploy
```

El comando `/deploy` configurará:
- Docker Rootless
- Variables de entorno
- Construcción del contenedor
- Servicio systemd --user
- Inicio automático

---

## ⚙️ Configuración

### Variables de Entorno (.env)

```bash
# Opción 1: Token de Kimi Code (recomendado para uso personal)
# Obtén tu token ejecutando: kimi setup-token
MOONSHOT_API_KEY='tu-token-de-kimi-o-api-key'

# Opción 2: API Key directa de Moonshot AI
# MOONSHOT_API_KEY='sk-...'

# Nombre del asistente (trigger word)
ASSISTANT_NAME=Andy

# Configuración opcional
CONTAINER_IMAGE=nanokimi-agent:latest
CONTAINER_TIMEOUT=300000
LOG_LEVEL=info
```

### Estructura de Directorios

```
nanokimi/
├── groups/
│   ├── KIMI.md                 # Memoria global
│   └── main/                   # Tu chat personal (admin)
│       ├── KIMI.md             # Memoria del canal principal
│       └── logs/
├── src/                        # Código fuente
├── container/                  # Configuración Docker
│   ├── Dockerfile
│   └── agent-runner/           # Código que corre dentro del contenedor
├── .kimi/skills/               # Skills de configuración
│   ├── setup/SKILL.md          # Setup inicial (macOS)
│   ├── setup-vps/SKILL.md      # Setup Docker Rootless en VPS ⭐
│   ├── deploy/SKILL.md         # Deploy de NanoKimi
│   ├── customize/SKILL.md
│   └── debug/SKILL.md
├── data/                       # Estado de la aplicación
│   ├── sessions.json           # IDs de sesión por grupo
│   ├── registered_groups.json  # Grupos registrados
│   └── ipc/                    # Comunicación inter-proceso
├── store/                      # Base de datos SQLite
│   └── messages.db
└── logs/                       # Logs de ejecución
    └── nanokimi.log
```

---

## 💬 Uso

### Interactuar con el Asistente

Desde cualquier grupo de WhatsApp registrado, usa el trigger word (por defecto `@Andy`):

```
@Andy ¿Cuál es el clima hoy?

@Andy resume los emails que recibí esta mañana

@Andy programa un recordatorio cada lunes a las 9am para revisar métricas
```

### Comandos de Administración (Canal Principal)

Desde tu chat personal (main channel), puedes gestionar todo:

```
@Andy añade grupo "Equipo de Trabajo"
@Andy elimina grupo "Equipo de Trabajo"
@Andy lista grupos

@Andy lista todas las tareas programadas
@Andy pausa tarea [id]
@Andy reanuda tarea [id]
@Andy cancela tarea [id]

@Andy recuerda que prefiero modo oscuro
@Andy recuerda globalmente que soy desarrollador
```

### Memoria y Contexto

- **Memoria de grupo**: El asistente recuerda conversaciones previas dentro del mismo grupo
- **Memoria global**: Información compartida entre todos los grupos (editable solo desde main)
- **Archivos**: Puedes crear y editar archivos `.md` en el directorio del grupo para referencia

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HOST (macOS / Linux)                         │
│                      (Proceso Node.js Principal)                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐                     ┌────────────────────┐        │
│  │  WhatsApp    │────────────────────▶│   Base de Datos    │        │
│  │  (baileys)   │◀────────────────────│   SQLite           │        │
│  └──────────────┘   almacenar/enviar  └─────────┬──────────┘        │
│                                                  │                   │
│         ┌────────────────────────────────────────┘                   │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  Bucle de        │    │  Planificador    │    │  Watcher IPC  │  │
│  │  Mensajes        │    │  (tareas)        │    │  (archivos)   │  │
│  │  (poll SQLite)   │    │                  │    │               │  │
│  └────────┬─────────┘    └────────┬─────────┘    └───────────────┘  │
│           │                       │                                  │
│           └───────────┬───────────┘                                  │
│                       │ spawnea contenedor                           │
│                       ▼                                              │
├─────────────────────────────────────────────────────────────────────┤
│                    CONTENEDOR DOCKER (aislado)                        │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    AGENT RUNNER                               │   │
│  │                                                                │   │
│  │  Directorio de trabajo: /workspace/group (montado del host)   │   │
│  │  Montajes de volúmenes:                                        │   │
│  │    • groups/{nombre}/ → /workspace/group                       │   │
│  │    • groups/global/ → /workspace/global/ (solo no-main)        │   │
│  │    • data/sessions/{group}/.kimi/ → /home/node/.kimi/          │   │
│  │                                                                │   │
│  │  Herramientas disponibles:                                     │   │
│  │    • Bash, Read, Write, Edit, Glob, Grep                       │   │
│  │    • WebSearch, WebFetch                                       │   │
│  │    • mcp__nanokimi__* (tareas programadas)                     │   │
│  │                                                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Flujo de un Mensaje

1. **Recepción**: Baileys recibe el mensaje de WhatsApp Web
2. **Almacenamiento**: Se guarda en SQLite con metadatos
3. **Polling**: El bucle principal revisa nuevos mensajes cada 2 segundos
4. **Enrutamiento**: Se verifica si el grupo está registrado y si tiene el trigger
5. **Contexto**: Se recopila el historial de conversación
6. **Ejecución**: Se spawnea un contenedor Docker con el Kimi Agent SDK
7. **Respuesta**: El agente procesa y genera una respuesta
8. **Envío**: La respuesta se envía por WhatsApp

---

## 🔒 Seguridad

### Modelo de Amenazas

| Componente | Nivel de Confianza | Mitigación |
|------------|-------------------|------------|
| Grupo Principal | ✅ Confiable | Chat personal, control total |
| Otros Grupos | ⚠️ No confiable | Aislamiento por contenedor |
| Agentes | 🔒 Sandboxed | Docker, solo montajes explícitos |
| Mensajes WhatsApp | ⚠️ Input del usuario | Validación de trigger, escaping |

### Características de Seguridad

- **Aislamiento de contenedores**: Cada ejecución es un contenedor fresco (`--rm`)
- **Usuario no privilegiado**: El contenedor corre como `node` (UID 1000), no root
- **Montajes limitados**: Solo directorios explícitamente permitidos son visibles
- **Bash seguro**: Los comandos se ejecutan dentro del contenedor, nunca en el host
- **Credenciales filtradas**: Solo `MOONSHOT_API_KEY` se monta en el contenedor
- **Validación de rutas**: Se resuelven symlinks antes de montar (previene traversal)

### Permisos de Grupos

| Capacidad | Grupo Principal | Otros Grupos |
|-----------|----------------|--------------|
| Enviar mensajes a su chat | ✅ | ✅ |
| Enviar mensajes a otros chats | ✅ | ❌ |
| Programar tareas para sí | ✅ | ✅ |
| Programar tareas para otros | ✅ | ❌ |
| Ver todas las tareas | ✅ | Solo propias |
| Escribir memoria global | ✅ | ❌ |
| Gestionar otros grupos | ✅ | ❌ |

Para más detalles, ver [docs/SECURITY.md](docs/SECURITY.md).

---

## 🛠️ Personalización

### Cambiar el Trigger Word

Edita `src/config.ts`:

```typescript
export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Bob';
```

O usa la variable de entorno:

```bash
ASSISTANT_NAME=Bob npm start
```

### Añadir Montajes Personalizados

Para dar acceso a directorios adicionales (ej: tu vault de Obsidian), edita `data/registered_groups.json`:

```json
{
  "1234567890@g.us": {
    "name": "Mi Vault",
    "folder": "mi-vault",
    "trigger": "@Andy",
    "containerConfig": {
      "additionalMounts": [
        {
          "hostPath": "/home/usuario/obsidian-vault",
          "containerPath": "vault",
          "readonly": false
        }
      ]
    }
  }
}
```

### Usar Skills

Las skills son guías que Kimi Code usa para modificar el código:

```
/setup       # Configuración inicial (macOS)
/deploy      # Despliegue en VPS (Linux)
/customize   # Cambios personalizados
/debug       # Solución de problemas

/add-gmail                  # Integración con Gmail
/add-parallel               # Investigación web avanzada
/add-voice-transcription    # Transcripción de notas de voz
/x-integration             # Integración con X/Twitter
```

---

## 🐛 Troubleshooting

### El servicio no responde

```bash
# macOS
launchctl list | grep nanokimi

# Linux
systemctl --user status nanokimi

# Ver logs
tail -f logs/nanokimi.log
```

### Error "Docker not running"

```bash
# macOS - Abre Docker Desktop
open -a Docker

# Linux
systemctl --user start docker
```

### WhatsApp QR expirado

```bash
# Detener servicio, regenerar QR, reiniciar
# macOS
launchctl unload ~/Library/LaunchAgents/com.nanokimi.plist
npm run auth
launchctl load ~/Library/LaunchAgents/com.nanokimi.plist

# Linux
systemctl --user stop nanokimi
npm run auth
systemctl --user start nanokimi
```

### Error "kimi: command not found" tras instalar

Si instalaste Kimi Code con `curl -L code.kimi.com/install.sh | bash` pero el comando `kimi` no se encuentra, puede ser un problema de permisos con `~/.local`:

```bash
# Verificar propietario de ~/.local
ls -la ~ | grep .local

# Si pertenece a otro usuario, corregir:
sudo chown -R $USER:$USER ~/.local
source $HOME/.local/bin/env
kimi --version
```

Esto ocurre comúnmente en VPS con múltiples usuarios donde el directorio `~/.local` fue creado por otro usuario.

### El asistente no responde a mensajes

1. Verifica que el grupo esté registrado: `cat data/registered_groups.json`
2. Comprueba que estés usando el trigger correcto (`@Andy` por defecto)
3. Revisa los logs: `tail -100 logs/nanokimi.log | grep -i error`

### Problemas de sesión (no recuerda conversación)

1. Verifica `data/sessions.json`
2. Comprueba que el montaje sea a `/home/node/.kimi/` (no `/root/.kimi/`)

Para más soluciones, ejecuta `/debug` en Kimi Code.

---

## 🤝 Contribuir

### Filosofía

**No añadas características. Añade skills.**

En lugar de modificar el código base para añadir soporte de Telegram, crea una skill `.kimi/skills/add-telegram/SKILL.md` que transforme una instalación existente. Esto mantiene el código base limpio y cada usuario obtiene exactamente lo que necesita.

### Qué aceptamos

- ✅ Fixes de seguridad
- ✅ Corrección de bugs
- ✅ Mejoras claras a la configuración base

### Qué NO aceptamos

- ❌ Nuevas integraciones en el código base (usar skills)
- ❌ Soporte para múltiples plataformas en el core
- ❌ Características que aumenten la complejidad

### Cómo contribuir una skill

1. Crea un directorio en `.kimi/skills/{nombre-skill}/`
2. Escribe `SKILL.md` con instrucciones paso a paso
3. Incluye ejemplos de código y troubleshooting
4. Abre un PR

---

## 📚 Documentación Adicional

- [docs/SPEC.md](docs/SPEC.md) - Especificación técnica completa
- [docs/SECURITY.md](docs/SECURITY.md) - Modelo de seguridad
- [docs/VPS-DEPLOY.md](docs/VPS-DEPLOY.md) - Guía de despliegue en VPS
- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) - Decisiones de arquitectura

---

## ❓ FAQ

**¿Por qué WhatsApp y no Telegram/Signal/etc?**

Porque es lo que uso. Haz fork y añade tu plataforma preferida como skill. Ese es el punto.

**¿Por qué Docker?**

Proporciona soporte multiplataforma (macOS y Linux), un ecosistema grande y herramientas maduras. En Linux VPS, Docker Rootless añade seguridad ejecutando sin privilegios root.

**¿Puedo ejecutar esto en Windows?**

No nativamente, pero puedes usar WSL2. Considera contribuir una skill `/setup-windows`.

**¿Es seguro?**

Los agentes corren en contenedores, no detrás de permisos a nivel de aplicación. Solo pueden acceder a directorios explícitamente montados. En VPS Linux, Docker Rootless añade otra capa de seguridad.

**¿Por qué no hay archivos de configuración?**

Queremos evitar la proliferación de configuraciones. Cada usuario debería personalizar el código para que coincida exactamente con lo que quiere, en lugar de configurar un sistema genérico. Si quieres archivos de configuración, dile a Kimi que los añada.

**¿Cómo depuro problemas?**

Pregúntale a Kimi Code. "¿Por qué no funciona el planificador?" "¿Qué hay en los logs recientes?" "¿Por qué este mensaje no obtuvo respuesta?" Ese es el enfoque nativo de IA.

---

## 📄 Licencia

MIT

---

<p align="center">
  Hecho con ❤️ y contenedores
</p>
