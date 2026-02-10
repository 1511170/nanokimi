# Sesión de Trabajo: OAuth Token Isolation - 10 de Febrero 2026

## Contexto

Estamos trabajando en mejorar la seguridad de NanoKimi mientras mantenemos la funcionalidad. El objetivo es que el sistema funcione como NanoClaw (el original basado en Claude) pero usando el modelo de Kimi.

## Problemas Encontrados Durante la Sesión

### 1. Nombre del Asistente Incorrecto

**Síntoma:** Kai respondía como "Kinto" o "Kimi Code CLI" genérico.

**Causa:** El servicio systemd no cargaba el archivo `.env` donde está definido `ASSISTANT_NAME=Kai`.

**Solución Aplicada:**
```bash
# En ~/.config/systemd/user/nanokimi.service
[Service]
EnvironmentFile=/home/camilo/nanokimi/.env  # <- Agregar esta línea
```

**Estado:** ✅ Resuelto - Ahora responde como "Kai"

---

### 2. Agente No Carga Contexto (KIMI.md)

**Síntoma:** El agente dentro del contenedor responde como si fuera "Kimi Code CLI" genérico, sin reconocer:
- Su nombre (Kai)
- Las skills disponibles
- Las capacidades documentadas en KIMI.md
- El contexto del grupo

**Mensajes del agente problemáticos:**
```
"Soy Kimi Code CLI, una herramienta de línea de comandos para tareas de programación. 
No tengo conexión con WhatsApp ni acceso a los grupos que Kinto (el bot) gestiona."
```

**Causa:** `container/agent-runner/src/index.ts` no carga el archivo `KIMI.md` del grupo como contexto del sistema.

**Código problemático (línea ~315):**
```typescript
const turn = session.prompt(globalKimiMd 
  ? `${globalKimiMd}\n\n${structuredOutputPrompt}` 
  : structuredOutputPrompt);
```

No incluye el `groupKimiMd` (contenido de `/workspace/group/KIMI.md`).

**Solución Requerida:**
```typescript
// 1. Cargar el KIMI.md del grupo
const groupKimiMdPath = '/workspace/group/KIMI.md';
let groupKimiMd: string | undefined;
if (fs.existsSync(groupKimiMdPath)) {
  groupKimiMd = fs.readFileSync(groupKimiMdPath, 'utf-8');
}

// 2. Usar modelo correcto
const session = createSession({
  model: 'kimi-code',  // <- Cambiar de 'kimi-latest'
  // ... resto de config
});

// 3. Incluir en el prompt
let fullPrompt = structuredOutputPrompt;
if (groupKimiMd && globalKimiMd) {
  fullPrompt = `${groupKimiMd}\n\n${globalKimiMd}\n\n${structuredOutputPrompt}`;
} else if (groupKimiMd) {
  fullPrompt = `${groupKimiMd}\n\n${structuredOutputPrompt}`;
}
```

**Bloqueo:** No podemos aplicar el fix porque:
1. La imagen Docker no se puede rebuild (ver problema #3)
2. Intentamos montar el código fuente sobre `/app` pero hay errores de TypeScript

**Estado:** 🔴 Pendiente - Requiere fix separado

---

### 3. Rebuild de Imagen Docker Bloqueado

**Síntoma:** Al intentar hacer `docker build` falla con:
```
ERROR: Could not find a version that satisfies the requirement kimi-cli
Requires-Python >=3.12
```

**Causa:** 
- Dockerfile usa `python:3.11-slim` como base
- `kimi-cli` requiere Python >= 3.12

**Dockerfile actual (línea 1):**
```dockerfile
FROM python:3.11-slim
```

**Solución Requerida:**
```dockerfile
FROM python:3.12-slim  # o python:3.13-slim
```

**Estado:** 🔴 Bloqueado - Sin imagen no podemos desplegar fixes al agent-runner

---

### 4. OAuth Token Isolation (EL FOCO DE ESTE BRANCH)

**Problema Original:** El contenedor tenía acceso de escritura a TODO el directorio `data/credentials/`, exponiendo potencialmente:
- Configuraciones sensibles
- Otros tokens
- Archivos de credenciales

**Solución Implementada:**

1. **Crear directorio aislado:**
   ```bash
   mkdir -p data/oauth-token/
   cp data/credentials/kimi-code.json data/oauth-token/
   ```

2. **Modificar mounts en `src/container-runner.ts`:**
   - `config.toml` → montado como **read-only** (archivo individual)
   - `oauth-token/` → montado como **writable** (solo el token)
   - `sessions/` → movido a `.kimi/sessions/` (evita conflictos)

3. **Estructura de mounts resultante:**
   | Host | Container | Permisos |
   |------|-----------|----------|
   | `data/credentials/config.toml` | `/home/node/.kimi/config.toml` | ro |
   | `data/oauth-token/` | `/home/node/.kimi/credentials` | rw |
   | `data/sessions/{group}/.kimi/` | `/home/node/.kimi/sessions` | rw |

**Permisos ACL aplicados:**
```bash
setfacl -m u:200999:rw data/oauth-token/kimi-code.json
setfacl -m u:300999:rw data/oauth-token/kimi-code.json
```

**Estado:** ✅ Funcionando - Token se refresca correctamente

---

## Estructura de Tokens Actual

Hay 3 copias del token OAuth:

| Ubicación | Propósito | Sincronizado |
|-----------|-----------|--------------|
| `~/.kimi/credentials/kimi-code.json` | Uso por CLI en host | ❌ Independiente |
| `data/credentials/kimi-code.json` | Backup / referencia | ❌ Independiente |
| `data/oauth-token/kimi-code.json` | Usado por contenedor | ✅ Este es el activo |

**Nota:** Cada token puede tener diferentes tiempos de expiración. El contenedor usa el de `oauth-token/`.

---

## Branch Creado: `fix/isolated-oauth-token`

### Commits:

```
e68e9af docs: add known issues section to branch summary
bea3552 docs: add branch summary for OAuth token isolation  
40dafb7 docs: add OAuth token isolation documentation and setup script
ca871b4 security: isolate OAuth token from other credentials
```

### Archivos modificados:

- `src/container-runner.ts` - Lógica de mounts aislados
- `docs/OAUTH_TOKEN_ISOLATION.md` - Documentación completa
- `docs/BRANCH_SUMMARY_OAUTH_ISOLATION.md` - Resumen del branch
- `scripts/setup-oauth-isolation.sh` - Script de setup automatizado
- `systemd/nanokimi.service` - Fix para cargar .env

### Estado del branch:

Listo para subir a GitHub. Incluye:
- ✅ Aislamiento de token OAuth
- ✅ Documentación completa
- ✅ Script de setup
- ⚠️ Documentación de problemas conocidos (agent context, Docker rebuild)

---

## Próximos Pasos Priorizados

### Alto Prioridad:

1. **Subir branch a GitHub** - El fix de seguridad está listo
2. **Crear branch `fix/agent-context-loading`** - Para arreglar el problema de KIMI.md
3. **Actualizar Dockerfile a Python 3.12+** - Desbloquea rebuilds de imagen

### Medio Prioridad:

4. **Sincronizar tokens** - Asegurar que host y contenedor usen el mismo token
5. **Probar refresh automático** - Verificar que el token se renueva cuando expira

### Bajo Prioridad:

6. **Limpiar directorio `testing-grupo-kinto`** - Tiene permisos de root/ACL
7. **Unificar tokens** - Considerar usar symlinks o un solo archivo

---

## Comandos Útiles Recordados

```bash
# Ver estado del token
python3 -c "import json; t=json.load(open('data/oauth-token/kimi-code.json')); import time; print(f'Expira en: {(t[\"expires_at\"]-time.time())/60:.1f} min')"

# Ver ACLs
getfacl data/oauth-token/kimi-code.json

# Reiniciar servicio
systemctl --user restart nanokimi

# Ver logs
journalctl --user -u nanokimi -f
tail -f logs/nanokimi.log

# Ver mounts del último contenedor
cat groups/main/logs/container-*.log | grep -A10 "Mounts"
```

---

## Conceptos Clave de NanoClaw/NanoKimi

### Cómo funciona el sistema:

1. **WhatsApp Web (Baileys)** recibe mensajes
2. **Index.ts** detecta mensajes dirigidos al asistente (@Kai)
3. **Container-runner.ts** prepara mounts y spawnea contenedor Docker
4. **Agent-runner** (dentro del contenedor) ejecuta el modelo de IA
5. **Respuesta** se envía de vuelta a WhatsApp

### Estructura de directorios clave:

```
nanokimi/
├── groups/
│   └── main/
│       ├── KIMI.md          # Contexto del asistente
│       └── logs/            # Logs del contenedor
├── data/
│   ├── credentials/         # Config (NO montado completo)
│   │   └── config.toml
│   ├── oauth-token/         # Token OAuth (montado rw)
│   │   └── kimi-code.json
│   ├── sessions/            # Sesiones por grupo
│   └── ipc/                 # Comunicación entre procesos
├── container/
│   └── agent-runner/        # Código que corre dentro del contenedor
└── .kimi/skills/            # Skills disponibles
```

### Montajes del contenedor:

- `/workspace/project` → proyecto completo (solo main)
- `/workspace/group` → carpeta del grupo específico
- `/home/node/.kimi/config.toml` → config OAuth (ro)
- `/home/node/.kimi/credentials` → token OAuth (rw)
- `/home/node/.kimi/sessions` → sesiones del grupo (rw)
- `/workspace/ipc` → comunicación con host (rw)
- `/workspace/env-dir` → variables de entorno (ro)

---

## Lecciones Aprendidas

1. **El contexto del asistente es crítico** - Sin KIMI.md, el agente no sabe quién es ni qué puede hacer
2. **Los mounts de Docker son clave** - La seguridad depende de qué se monta y cómo
3. **Versiones de Python importan** - kimi-cli requiere 3.12+, bloqueando builds
4. **systemd necesita EnvironmentFile** - Sin esto, no carga variables del .env
5. **ACLs son necesarios para Docker Rootless** - Permisos Unix estándar no suficientes

---

## Referencias

- Branch actual: `fix/isolated-oauth-token`
- Branch anterior: `fix/oauth-docker-mounts`
- Repo original: `1511170/nanokimi`
- Fork del usuario: `camilo-kimi/nanokimi`
