# Investigación: Configuración Kimi Agent SDK con OAuth

## Fecha: 2025-02-09
## Investigador: Kimi Code CLI (Agente)

---

## Resumen Ejecutivo

Se investigó y resolvió parcialmente la integración del Kimi Agent SDK (@moonshot-ai/kimi-agent-sdk) con autenticación OAuth en el contenedor Docker de NanoKimi. Se identificaron y corrigieron múltiples problemas de configuración, quedando pendiente únicamente la renovación del token OAuth expirado.

**Estado**: 🟡 En progreso - 90% completado

---

## Problema Inicial

**Síntoma**: Error "LLM is not set" al ejecutar el agente en el contenedor Docker.

**Contexto**:
- SDK: @moonshot-ai/kimi-agent-sdk v0.0.7
- Contenedor: nanoclaw-agent:latest (Python 3.12 + Node.js 22 + Chromium)
- Autenticación: OAuth (Kimi Code subscription)

---

## Diagnóstico y Soluciones Implementadas

### 1. Problema: Modelo Incorrecto ✅ RESUELTO

**Causa**: El SDK Node.js solicitaba modelo "kimi-latest" pero el config.toml definía "kimi-code".

**Síntoma**: 
```
Agent error: LLM is not set
```

**Solución**: Modificar `container/agent-runner/src/index.ts`:

```typescript
// ANTES (incorrecto)
const session = createSession({
  workDir: '/workspace/group',
  sessionId: input.sessionId,
  model: 'kimi-latest',  // ❌ No existe en config
  yoloMode: true,
  thinking: false,
});

// DESPUÉS (correcto)
const session = createSession({
  workDir: '/workspace/group',
  sessionId: input.sessionId,
  model: 'kimi-code',    // ✅ Coincide con config.toml
  yoloMode: true,
  thinking: false,
});
```

**Commit**: Cambio realizado en línea 349 de container/agent-runner/src/index.ts

---

### 2. Problema: Estructura de Mounts ✅ RESUELTO

**Causa**: El directorio de sesiones montado en `/home/node/.kimi` sobrescribía el config.toml.

**Síntoma**: El CLI no encontraba la configuración del provider.

**Solución**: Modificar `src/container-runner.ts` para montar:
1. `config.toml` como archivo (ro)
2. `credentials/` como directorio (ro)
3. `sessions/` como subdirectorio (rw)

```typescript
// En buildVolumeMounts()

// Kimi config file (for OAuth authentication)
const kimiConfigFile = path.join(DATA_DIR, 'credentials', 'config.toml');
if (fs.existsSync(kimiConfigFile)) {
  mounts.push({
    hostPath: kimiConfigFile,
    containerPath: '/home/node/.kimi/config.toml',
    readonly: true,
  });
}

// Kimi credentials directory
const kimiCredentialsDir = path.join(DATA_DIR, 'credentials');
if (fs.existsSync(kimiCredentialsDir)) {
  mounts.push({
    hostPath: kimiCredentialsDir,
    containerPath: '/home/node/.kimi/credentials',
    readonly: true,
  });
}

// Per-group Kimi sessions directory
const groupSessionsDir = path.join(DATA_DIR, 'sessions', group.folder, '.kimi');
mkdirForContainer(groupSessionsDir);
mounts.push({
  hostPath: groupSessionsDir,
  containerPath: '/home/node/.kimi/sessions',
  readonly: false,
});
```

---

### 3. Problema: Entrypoint Extrayendo Access Token ✅ RESUELTO

**Causa**: El entrypoint.sh extraía el access_token del JSON y lo usaba como MOONSHOT_API_KEY, interferiendo con OAuth.

**Síntoma**: El CLI intentaba usar el token JWT como API key en lugar de usar OAuth.

**Solución**: Modificar `container/entrypoint.sh`:

```bash
# ANTES (incorrecto)
if [ -f /home/node/.kimi/credentials/kimi-code.json ]; then
  export MOONSHOT_API_KEY=$(cat /home/node/.kimi/credentials/kimi-code.json | grep -o '"access_token": "[^"]*"' | cut -d'"' -f4)
  echo "[entrypoint] Loaded Kimi credentials" >&2
fi

# DESPUÉS (correcto)
if [ -f /home/node/.kimi/config.toml ]; then
  echo "[entrypoint] Kimi config loaded" >&2
fi
```

---

### 4. Problema: Configuración TOML Incorrecta ✅ RESUELTO

**Causas encontradas**:
1. Capabilities inválidas: "tool_call" no es válida
2. Key OAuth incorrecto: debe ser "oauth/kimi-code", no ruta completa
3. Base URL incorrecta: debe ser "https://api.kimi.com/coding/v1"

**Configuración correcta final**:

```toml
default_model = "kimi-code"
default_thinking = false
default_yolo = true

[models.kimi-code]
provider = "managed:kimi-code"
model = "kimi-latest"
max_context_size = 200000
capabilities = ["thinking"]  # Opciones válidas: image_in, video_in, thinking, always_thinking

[providers."managed:kimi-code"]
type = "kimi"
base_url = "https://api.kimi.com/coding/v1"
api_key = ""
oauth = { storage = "file", key = "oauth/kimi-code" }  # Key relativo, no ruta absoluta

[loop_control]
max_steps_per_turn = 100
max_retries_per_step = 3
max_ralph_iterations = 0
reserved_context_size = 50000

[services]
```

---

## Problema Pendiente

### Token OAuth Expirado ❌ PENDIENTE

**Síntoma**: 
```
Error code: 401 - {'error': {'message': 'The API Key appears to be invalid or may have expired...'}}
```

**Causa**: El refresh token OAuth expiró o fue invalidado.

**Log del CLI**:
```
WARNING | kimi_cli.auth.oauth:_refresh_tokens:769 - 
Failed to refresh OAuth token: The provided authorization grant is invalid
```

**Estructura del token**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_at": 1770658583.17,
  "scope": "kimi-code",
  "token_type": "Bearer"
}
```

**Tiempo restante**: ~0 segundos (expirado)

---

## Arquitectura de Autenticación

### Flujo OAuth del Kimi CLI

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   SDK Node.js   │────▶│   CLI Python     │────▶│  OAuth Server   │
│                 │     │                  │     │  (auth.kimi.com)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                         │
        │                        │                         │
        ▼                        ▼                         ▼
  config.toml              load_tokens()              refresh_token
  oauth = {...}            key="oauth/kimi-code"      access_token
                           ~/.kimi/credentials/
                           kimi-code.json
```

### Archivos Involucrados

| Archivo | Ubicación en Host | Ubicación en Contenedor | Propósito |
|---------|-------------------|------------------------|-----------|
| config.toml | `~/nanokimi/data/credentials/` | `/home/node/.kimi/config.toml` | Configuración de provider y modelo |
| kimi-code.json | `~/nanokimi/data/credentials/` | `/home/node/.kimi/credentials/` | Tokens OAuth (access_token, refresh_token) |
| sessions/ | `~/nanokimi/data/sessions/{group}/.kimi/` | `/home/node/.kimi/sessions/` | Sesiones persistentes por grupo |

---

## Opciones de Solución

### Opción 1: Renovar OAuth (Recomendada)

**Pasos**:
```bash
# 1. En máquina local (con navegador)
kimi login

# 2. Copiar token renovado al servidor
scp ~/.kimi/credentials/kimi-code.json \
   camilo@tuservidor:/home/camilo/nanokimi/data/credentials/

# 3. Asegurar permisos en servidor
chmod 644 ~/nanokimi/data/credentials/kimi-code.json
```

**Ventajas**:
- Usa la suscripción existente de Kimi Code
- No requiere cambios en la configuración

---

### Opción 2: Usar API Key de Moonshot

**Pasos**:
1. Obtener API key de https://platform.moonshot.cn/
2. Recargar saldo en la cuenta
3. Configurar en `config.toml`:

```toml
[providers."managed:kimi-code"]
type = "kimi"
base_url = "https://api.moonshot.cn/v1"
api_key = "sk-tu-api-key-aqui"  # Sin oauth
```

**Ventajas**:
- No expira (a menos que se revoque)
- Más simple de administrar

**Desventajas**:
- Requiere saldo en cuenta Moonshot
- Diferente sistema de facturación que Kimi Code

---

### Opción 3: Autenticación Manual del Token

Si se tiene acceso a un token válido temporalmente, se puede:

```bash
# Extraer access_token y usar como API key
export MOONSHOT_API_KEY=$(jq -r '.access_token' ~/.kimi/credentials/kimi-code.json)
```

**Nota**: Esta aproximación no es recomendada porque los access_tokens expiran rápidamente (~1 hora).

---

## Comandos de Debug Útiles

### Verificar configuración en contenedor
```bash
docker run -i --rm \
  -v ~/nanokimi/data/credentials/config.toml:/home/node/.kimi/config.toml:ro \
  -v ~/nanokimi/data/credentials:/home/node/.kimi/credentials:ro \
  --entrypoint sh nanoclaw-agent:latest -c '
    python3 -c "
from kimi_cli.config import load_config
config = load_config()
print(\"Default model:\", config.default_model)
print(\"Models:\", list(config.models.keys()))
print(\"Providers:\", list(config.providers.keys()))
for name, p in config.providers.items():
    print(f\"  {name}: oauth={p.oauth}\")
"
  '
```

### Probar CLI directamente
```bash
cd /tmp && echo "Hola" | kimi --print --yolo \
  --prompt "Responde brevemente" 2>&1
```

### Ver logs del CLI
```bash
cat /home/node/.kimi/logs/kimi.log
```

---

## Referencias

- Kimi CLI Documentation: https://moonshotai.github.io/kimi-cli/
- Kimi Agent SDK: @moonshot-ai/kimi-agent-sdk v0.0.7
- Kimi CLI Version: 1.9.0
- Protocol Version: 1.1 (SDK) / 1.3 (Server)

---

## Próximos Pasos

1. [ ] Renovar token OAuth con `kimi login`
2. [ ] Copiar token al servidor
3. [ ] Probar agente con mensaje de WhatsApp
4. [ ] Documentar configuración final en AGENTS.md

---

*Documento generado automáticamente por Kimi Code CLI*
*Última actualización: 2025-02-09*
