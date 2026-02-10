# Resumen Configuración Completa NanoKimi - 9 Feb 2025

## 🎯 Objetivo
Configurar NanoKimi para funcionar con WhatsApp y autenticación OAuth de Kimi Code.

## ✅ Problemas Resueltos

### 1. Estructura de Mounts (container-runner.ts)
**Problema:** Los mounts originales sobrescribían el config.toml con el directorio de sesiones.

**Solución:** Separar los mounts:
- `config.toml` → `/home/node/.kimi/config.toml` (read-only, archivo individual)
- `credentials/` → `/home/node/.kimi/credentials` (read-write para refresh OAuth)
- `sessions/<group>/` → `/home/node/.kimi/sessions` (read-write)

### 2. Modelo Incorrecto (agent-runner)
**Problema:** El agente pedía modelo "kimi-latest" pero el config tenía "kimi-code".

**Solución:** Cambiar en `container/agent-runner/src/index.ts`:
```typescript
// Antes
model: 'kimi-latest'
// Después  
model: 'kimi-code'
```

### 3. Entrypoint Interfiriendo
**Problema:** El entrypoint extraía el access_token OAuth y lo ponía en MOONSHOT_API_KEY, interferiendo con la autenticación.

**Solución:** Eliminar la extracción del token en `container/entrypoint.sh`.

### 4. Estructura Correcta del config.toml
```toml
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
```

**Notas importantes:**
- `capabilities` válidas: "thinking", "always_thinking", "image_in", "video_in"
- `oauth.key` debe ser "oauth/kimi-code" (no la ruta completa)
- `base_url` correcta: https://api.kimi.com/coding/v1

### 5. Cambio de Nombre (Kinto → Kai)
**Archivos modificados:**
- `src/config.ts` - Default cambiado a 'Kai'
- `groups/main/KIMI.md` - Referencias actualizadas
- `groups/global/KIMI.md` - Referencias actualizadas
- `.env` - Agregada ASSISTANT_NAME=Kai

### 6. Permisos del Token OAuth
**Problema:** El contenedor no podía refrescar el token (read-only filesystem).

**Solución:**
```bash
# Permisos base
chmod 664 ~/nanokimi/data/credentials/kimi-code.json

# ACLs para Docker Rootless
setfacl -m u:200999:rw ~/nanokimi/data/credentials/kimi-code.json
setfacl -m u:300999:rw ~/nanokimi/data/credentials/kimi-code.json
```

## 📁 Estructura de Archivos

```
~/nanokimi/
├── data/
│   ├── credentials/
│   │   ├── config.toml          # Configuración Kimi (read-only)
│   │   └── kimi-code.json       # Token OAuth (read-write)
│   └── sessions/
│       └── main/                # Sesiones del grupo main
├── groups/
│   ├── main/
│   │   └── KIMI.md              # Prompt del grupo main
│   └── global/
│       └── KIMI.md              # Prompt global
└── store/
    └── auth/
        └── creds.json           # Credenciales WhatsApp
```

## 🔧 Comandos Útiles

```bash
# Verificar estado del servicio
systemctl --user status nanokimi

# Ver logs recientes
journalctl --user -u nanokimi -n 50 -f

# Ver logs de contenedor
ls -la ~/nanokimi/logs/containers/
cat ~/nanokimi/logs/containers/<archivo>.log

# Verificar token OAuth
cat ~/.kimi/credentials/kimi-code.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
import time
remaining = data.get('expires_at', 0) - time.time()
print(f'Token expira en: {remaining/60:.1f} minutos')
"

# Renovar token OAuth (en máquina local con navegador)
kimi login
scp ~/.kimi/credentials/kimi-code.json servidor:~/nanokimi/data/credentials/
```

## 🚀 Estado Final

| Componente | Estado |
|------------|--------|
| WhatsApp | ✅ Conectado |
| OAuth | ✅ Funcionando con refresh automático |
| Nombre agente | ✅ Kai |
| Skills | ✅ 2 activas (kimi-cli-help, skill-creator) |
| Procesamiento mensajes | ✅ Funcionando |

## 💡 Lecciones Aprendidas

1. **OAuth vs API Key:** OAuth requiere refresh periódico, pero es más seguro. El CLI de Kimi maneja el refresh automáticamente si tiene permisos de escritura.

2. **Docker Rootless y permisos:** Los UIDs en el contenedor se mapean a UIDs diferentes en el host. Usar ACLs para dar permisos específicos.

3. **Mounts de archivos vs directorios:** No se puede montar un archivo sobre un directorio montado. Separar config.toml (archivo) de credentials/ (directorio).

4. **Modelos:** El SDK Node.js debe usar el mismo modelo que está configurado en el config.toml del CLI Python.

## 📝 Prueba de Funcionamiento

Mensaje enviado: `@Kai Hola`

Respuesta recibida:
```
Kai: ¡Hola Camilo! Sí, estoy aquí. Disculpa la demora.

Respecto a las skills de NanoKimi, actualmente tengo disponibles:
1. *kimi-cli-help* - Para responder preguntas sobre Kimi Code CLI
2. *skill-creator* - Guía para crear nuevas skills

¿En qué puedo ayudarte hoy?
```

---
Fecha: 9 de febrero de 2025
