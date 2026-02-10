# NanoKimi Setup - Camilo

**Fecha:** 2026-02-09  
**Usuario:** camilo  
**VPS:** vmi3058766

---

## Resumen de Configuración

| Componente | Valor |
|------------|-------|
| **Trigger Word** | `@Kai` |
| **Canal Principal** | Chat personal (573044556644@s.whatsapp.net) |
| **Container UID** | 300999 |
| **Docker Context** | rootless |
| **Imagen** | nanoclaw-agent:latest (2.57GB) |

---

## 1. Problemas Encontrados y Soluciones

### 1.1 Docker Rootless - Storage Corrupto

**Problema:** El snapshotter `overlayfs` de Docker Rootless estaba corrupto.

```
failed to create prepare snapshot dir: failed to create temp dir: 
stat /home/camilo/.local/share/docker/containerd/daemon/...: no such file
```

**Solución:** Crear los directorios faltantes manualmente:
```bash
mkdir -p ~/.local/share/docker/containerd/daemon/io.containerd.snapshotter.v1.overlayfs/snapshots
chmod -R 700 ~/.local/share/docker/containerd/
```

### 1.2 Python Version - Kimi CLI Requiere Python 3.12+

**Problema:** La imagen base `node:22-slim` usa Python 3.11, pero `kimi-cli` requiere >=3.12.

**Solución:** Cambiar a imagen base `python:3.12-slim-bookworm` e instalar Node.js manualmente.

**Archivo modificado:** `container/Dockerfile`

```dockerfile
FROM python:3.12-slim-bookworm

# Install Node.js 22
RUN apt-get update && apt-get install -y \
    curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs
```

### 1.3 Código Incompatible - Referencias a Claude SDK

**Problema:** El código del agente tenía referencias a `@anthropic-ai/claude-agent-sdk` en lugar de `@moonshot-ai/kimi-agent-sdk`.

**Archivos modificados:**
- `container/agent-runner/src/ipc-mcp.ts` - Cambiar import de Claude a Kimi SDK
- `container/agent-runner/src/index.ts` - Arreglar función `parseSessionEvents` faltante

### 1.4 Permisos - Usuario node sin Home Directory

**Problema:** El usuario `node` dentro del contenedor no tenía home directory (`/home/node`).

**Solución:** Crear usuario con `-m` flag y directorio `.kimi`:
```dockerfile
RUN groupadd -r node && useradd -r -g node -u 1000 -m -d /home/node node
RUN mkdir -p /home/node/.kimi && chown -R node:node /home/node
```

### 1.5 Autenticación Kimi - Token OAuth vs API Key

**Problema:** El SDK de Kimi Agent (`@moonshot-ai/kimi-agent-sdk`) no acepta el token OAuth de Kimi Code CLI. Requiere una API key de Moonshot AI.

**Solución:** 
1. Obtener API key desde https://platform.moonshot.cn/
2. Configurar en `MOONSHOT_API_KEY`

**Estado:** Pendiente de verificación con API key proporcionada.

---

## 2. Estructura de Directorios Creada

```
~/nanokimi/
├── .env                          # API key de Moonshot
├── data/
│   ├── registered_groups.json    # Configuración del canal principal
│   ├── env/env                   # Variables de entorno para contenedores
│   ├── kimi-credentials/         # Credenciales Kimi (copia con permisos)
│   ├── sessions/                 # Sesiones por grupo
│   ├── ipc/                      # Comunicación inter-proceso
│   └── ...
├── groups/
│   ├── main/                     # Grupo principal
│   │   ├── logs/
│   │   └── KIMI.md
│   └── global/
│       └── KIMI.md
├── logs/
│   └── nanokimi.log
├── store/
│   └── auth/                     # Credenciales WhatsApp (Baileys)
└── records/
    └── nanokimi-camilo-setup.md  # Este archivo
```

---

## 3. Configuración Actual

### 3.1 Canal Principal (data/registered_groups.json)

```json
{
  "573044556644@s.whatsapp.net": {
    "name": "main",
    "folder": "main",
    "trigger": "@Kai",
    "added_at": "2026-02-09T01:10:00.000Z",
    "requiresTrigger": false
  }
}
```

### 3.2 Environment Variables (.env)

```bash
MOONSHOT_API_KEY=sk-AoFwBMBWhGWF0gFOxzdhYf3aax4KpANUBNYRdjJnu7StpfU4
```

### 3.3 Docker Context

```bash
export XDG_RUNTIME_DIR=/run/user/993
docker context use rootless
```

---

## 4. Comandos Útiles

### Iniciar NanoKimi

```bash
cd ~/nanokimi
export XDG_RUNTIME_DIR=/run/user/993
npm start
```

### Background

```bash
cd ~/nanokimi
export XDG_RUNTIME_DIR=/run/user/993
nohup npm start > logs/nanokimi.log 2>&1 &
```

### Ver Logs

```bash
# Logs principales
tail -f ~/nanokimi/logs/nanokimi.log

# Logs de contenedor específico
tail -f ~/nanokimi/groups/main/logs/container-*.log
```

### Reconstruir Imagen Docker

```bash
cd ~/nanokimi/container
export XDG_RUNTIME_DIR=/run/user/993
./build.sh
```

### Verificar Docker Rootless

```bash
export XDG_RUNTIME_DIR=/run/user/993
docker info --format '{{.SecurityOptions}}'
# Debe mostrar: [name=rootless]
```

---

## 5. Problema Pendiente: LLM is not set

**Status:** 🔴 No resuelto

**Error:**
```
[agent-runner] Agent error: LLM is not set
```

**Causa:** El SDK `@moonshot-ai/kimi-agent-sdk` no está reconociendo la variable de entorno `MOONSHOT_API_KEY`.

**Intentos realizados:**
1. ✅ Montar credenciales de Kimi CLI - No funciona (token OAuth incompatible)
2. ✅ Usar API key de Moonshot AI en `.env` - Variable se pasa pero SDK no la lee
3. ❓ Pendiente: Verificar si el SDK requiere configuración adicional

**Posibles soluciones:**
- Revisar documentación del SDK para ver cómo configurar API key
- Intentar pasar la API key directamente en el código (no como env var)
- Verificar si existe otra variable de entorno requerida

---

## 6. WhatsApp Authentication

**Status:** ✅ Funcionando

**Número:** +57 304 455 6644  
**JID:** `573044556644@s.whatsapp.net`

**Autenticación realizada desde terminal externa** (no desde Kimi Code CLI debido a timeout).

Credenciales almacenadas en: `~/nanokimi/store/auth/`

---

## 7. Archivos Modificados

### 7.1 Dockerfile (`container/Dockerfile`)
- Cambiada base de `node:22-slim` a `python:3.12-slim-bookworm`
- Agregada instalación de Node.js manual
- Creado entrypoint script externo (`entrypoint.sh`)
- Configurado usuario `node` con home directory

### 7.2 Entrypoint (`container/entrypoint.sh`)
- Lee variables de entorno desde `/workspace/env-dir/env`
- Extrae token Kimi de credenciales montadas
- Exporta `MOONSHOT_API_KEY`

### 7.3 Container Runner (`src/container-runner.ts`)
- Agregado mount para credenciales de Kimi
- Ruta: `data/kimi-credentials` → `/home/node/.kimi/credentials`

### 7.4 Agente (`container/agent-runner/src/`)
- `index.ts`: Arreglada función `parseSessionEvents` faltante
- `index.ts`: Corregidos tipos para `user_input` (string | ContentPart[])
- `ipc-mcp.ts`: Cambiado import de `@anthropic-ai/claude-agent-sdk` a `@moonshot-ai/kimi-agent-sdk`
- `ipc-mcp.ts`: Simplificada interfaz MCP (SDK de Kimi no tiene `createSdkMcpServer`)

---

## 8. Próximos Pasos

1. 🔴 **Resolver error "LLM is not set"**
   - Investigar cómo el SDK de Kimi espera recibir la API key
   - Verificar si necesita configuración adicional

2. 🟡 **Test de respuesta**
   - Enviar mensaje "Hola Kai" al chat personal
   - Verificar que el agente responde

3. 🟢 **Configurar servicio systemd** (opcional)
   - Crear servicio systemd --user para auto-inicio
   - Actualmente solo funciona con `nohup` o manual

---

## 9. Notas Adicionales

- **Docker Rootless:** El usuario `camilo` (UID 993) tiene Docker Rootless configurado. Los contenedores corren sin privilegios de root.
  
- **Container UID:** El usuario `node` dentro del contenedor tiene UID 1000, que mapea a UID 300999 en el host (subuid base 300000 + 999).

- **ACLs:** Configurados para permitir escritura al contenedor en directorios `groups`, `data`, `store`.

- **Chromium:** Instalado en la imagen Docker pero no probado aún. Puede usarse con `agent-browser`.

---

## 10. Contacto y Soporte

- **Repositorio:** https://github.com/1511170/nanokimi
- **Documentación:** Ver `README.md` y `docs/` en el proyecto
- **Kimi CLI:** `kimi login` para renovar token OAuth si es necesario

---

## Actualización: 2025-02-09 - Configuración OAuth Kimi

### Cambios Realizados

1. **Agent Runner** (`container/agent-runner/src/index.ts`):
   - Cambiado modelo de 'kimi-latest' a 'kimi-code'

2. **Container Runner** (`src/container-runner.ts`):
   - Agregado mount para config.toml como archivo
   - Agregado mount para credentials/
   - Cambiado mount de sesiones a /home/node/.kimi/sessions

3. **Entrypoint** (`container/entrypoint.sh`):
   - Removida extracción de MOONSHOT_API_KEY
   - Solo verifica existencia de config.toml

4. **Configuración** (`data/credentials/config.toml`):
   - Creado con estructura correcta para OAuth
   - Base URL: https://api.kimi.com/coding/v1
   - OAuth key: "oauth/kimi-code"

### Estructura de Archivos de Autenticación

```
~/nanokimi/data/credentials/
├── config.toml          # Configuración del provider
└── kimi-code.json       # Tokens OAuth (pendiente renovación)
```

### Estado de Autenticación

- ⚠️ **Token OAuth expirado** - Requiere `kimi login` para renovar
- ✅ Configuración técnica completa
- ✅ Mounts correctamente configurados
- ✅ Modelo corregido

### Comando para Renovar Token

```bash
# En máquina local
kimi login
scp ~/.kimi/credentials/kimi-code.json \
   camilo@tuservidor:/home/camilo/nanokimi/data/credentials/
```

