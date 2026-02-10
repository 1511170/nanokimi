# Resumen de Cambios: OAuth + Docker Mounts Fix

## 📊 Comparación: Antes vs Después

### 1. Estructura de Mounts Docker

**ANTES (Problemático):**
```typescript
// Solo montaba sesiones, sobrescribiendo todo .kimi/
{
  hostPath: groupSessionsDir,
  containerPath: '/home/node/.kimi',  // ❌ Sobrescribe config.toml
  readonly: false,
}
```

**DESPUÉS (Corregido):**
```typescript
// Mount separados para cada componente
{
  hostPath: kimiConfigFile,           // ✅ Archivo individual
  containerPath: '/home/node/.kimi/config.toml',
  readonly: false,
},
{
  hostPath: kimiCredentialsDir,       // ✅ Directorio de credenciales
  containerPath: '/home/node/.kimi/credentials',
  readonly: false,                    // ✅ Necesario para refresh OAuth
},
{
  hostPath: groupSessionsDir,         // ✅ Solo sesiones
  containerPath: '/home/node/.kimi/sessions',
  readonly: false,
}
```

### 2. Modelo del Agente

**ANTES:**
```typescript
const session = createSession({
  model: 'kimi-latest',  // ❌ No coincide con config.toml
});
```

**DESPUÉS:**
```typescript
const session = createSession({
  model: 'kimi-code',    // ✅ Coincide con config.toml
});
```

### 3. Dockerfile

**ANTES:**
```dockerfile
FROM node:22-slim                    # ❌ No tenía Python
RUN pip3 install kimi-cli --break-system-packages  # ❌ pip3 no disponible
RUN printf '...' > entrypoint.sh     # ❌ Inline, difícil de mantener
```

**DESPUÉS:**
```dockerfile
FROM python:3.12-slim-bookworm       # ✅ Base Python
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs        # ✅ Node.js sobre Python
RUN pip install kimi-cli             # ✅ pip disponible
COPY entrypoint.sh /app/entrypoint.sh # ✅ Archivo separado
RUN useradd -r -g node -u 1000 node  # ✅ Usuario node para compatibilidad
```

### 4. Configuración Kimi

**ANTES (No existía en el contenedor):**
- No había forma de pasar OAuth al contenedor
- Solo funcionaba con API key de Moonshot

**DESPUÉS:**
```toml
# data/credentials/config.toml
default_model = "kimi-code"

[models.kimi-code]
provider = "managed:kimi-code"
model = "kimi-latest"

[providers."managed:kimi-code"]
type = "kimi"
base_url = "https://api.kimi.com/coding/v1"
oauth = { storage = "file", key = "oauth/kimi-code" }  # ✅ OAuth configurado
```

### 5. Nombre del Asistente

**ANTES:**
```typescript
export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Kinto';
```

**DESPUÉS:**
```typescript
export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Kai';
```

## 🎯 Problemas Resueltos

| Problema | Error | Solución |
|----------|-------|----------|
| Config sobrescrito | "LLM is not set" | Separar mounts de config.toml |
| Modelo incorrecto | "Invalid model" | Cambiar a 'kimi-code' |
| Token no refresca | "Read-only file system" | Permisos de escritura en credentials |
| Sin Python | "pip3: not found" | Usar imagen base Python |
| Sin OAuth | "Invalid Authentication" | Agregar config.toml con OAuth |

## 📁 Archivos Modificados

```
Modificados:
  src/container-runner.ts           # Lógica de mounts
  container/agent-runner/src/index.ts  # Modelo y parsing
  container/Dockerfile              # Imagen base y setup
  container/agent-runner/src/ipc-mcp.ts  # SDK compatibility
  src/config.ts                     # Nombre default
  groups/main/KIMI.md               # Prompt
  groups/global/KIMI.md             # Prompt global

Nuevos:
  container/entrypoint.sh           # Script de entrada
  docs/OAUTH_DOCKER_SETUP.md        # Guía completa
  docs/CAMBIO_RESUMEN.md            # Este archivo
  records/                          # Investigación y notas
```

## 🚀 Beneficios

1. **OAuth funcional:** Tokens se refrescan automáticamente
2. **Config separada:** No más conflictos entre config y sesiones
3. **Mantenible:** Dockerfile más limpio, entrypoint separado
4. **Documentado:** Guía completa para replicar el setup
5. **Seguro:** Permisos correctos con ACLs para Docker Rootless

## 🔄 Flujo de Autenticación

```
Usuario envía mensaje → WhatsApp
         ↓
NanoKimi recibe mensaje
         ↓
Inicia contenedor Docker
         ↓
Monta: config.toml (ro) + credentials (rw) + sessions (rw)
         ↓
Kimi CLI lee config.toml → encuentra OAuth config
         ↓
Lee token de credentials/kimi-code.json
         ↓
Si token expira → refresca automáticamente
         ↓
Llama a API de Kimi Code
         ↓
Retorna respuesta al usuario
```

## 📝 Notas para Desarrolladores

### Para hacer merge a main:

```bash
# 1. Cambiar a main
git checkout main

# 2. Hacer merge
git merge fix/oauth-docker-mounts

# 3. Resolver conflictos si los hay
# 4. Push
git push origin main
```

### Para probar el branch:

```bash
# Clonar y cambiar al branch
git clone <repo>
cd nanokimi
git checkout fix/oauth-docker-mounts

# Seguir guía en docs/OAUTH_DOCKER_SETUP.md
```

---

**Branch:** `fix/oauth-docker-mounts`  
**Commit:** `52396d5`  
**Fecha:** 9 de febrero de 2025
