# Agent Context Loading Fix

## Problem

The agent inside the Docker container was responding as a generic "Kimi Code CLI" instead of the configured assistant (Kai). It did not:

- Recognize its name (Kai)
- Know about available skills
- Understand group-specific capabilities
- Load the assistant's context from `KIMI.md`

### Example of incorrect response:

```
Soy Kimi Code CLI, una herramienta de línea de comandos para tareas de programación. 
No tengo conexión con WhatsApp ni acceso a los grupos que Kinto (el bot) gestiona.
```

## Root Cause

The `container/agent-runner/src/index.ts` was not loading the group's `KIMI.md` file as system context. It only loaded:
- The user's prompt
- Optional global KIMI.md (for non-main groups)

But ignored the primary `/workspace/group/KIMI.md` which contains the assistant's identity and capabilities.

## Solution

Modified `container/agent-runner/src/index.ts` to:

1. **Load group KIMI.md** as primary system context
2. **Change model** from `'kimi-latest'` to `'kimi-code'` (matching config)
3. **Build full context** combining group + global + structured output instructions

### Changes Made

**Before:**
```typescript
// Only loaded global KIMI.md
const globalKimiMdPath = '/workspace/global/KIMI.md';
let globalKimiMd: string | undefined;
if (!input.isMain && fs.existsSync(globalKimiMdPath)) {
  globalKimiMd = fs.readFileSync(globalKimiMdPath, 'utf-8');
}

// Wrong model
const session = createSession({
  model: 'kimi-latest',
  // ...
});

// Prompt without group context
const turn = session.prompt(globalKimiMd 
  ? `${globalKimiMd}\n\n${structuredOutputPrompt}` 
  : structuredOutputPrompt);
```

**After:**
```typescript
// Load group KIMI.md (primary context)
const groupKimiMdPath = '/workspace/group/KIMI.md';
let groupKimiMd: string | undefined;
if (fs.existsSync(groupKimiMdPath)) {
  groupKimiMd = fs.readFileSync(groupKimiMdPath, 'utf-8');
}

// Also load global (secondary)
const globalKimiMdPath = '/workspace/global/KIMI.md';
let globalKimiMd: string | undefined;
if (!input.isMain && fs.existsSync(globalKimiMdPath)) {
  globalKimiMd = fs.readFileSync(globalKimiMdPath, 'utf-8');
}

// Correct model
const session = createSession({
  model: 'kimi-code',
  // ...
});

// Build full context
let fullContext = structuredOutputPrompt;
if (groupKimiMd && globalKimiMd) {
  fullContext = `${groupKimiMd}\n\n${globalKimiMd}\n\n${structuredOutputPrompt}`;
} else if (groupKimiMd) {
  fullContext = `${groupKimiMd}\n\n${structuredOutputPrompt}`;
} else if (globalKimiMd) {
  fullContext = `${globalKimiMd}\n\n${structuredOutputPrompt}`;
}

const turn = session.prompt(fullContext);
```

## Context Priority

The context is built in this order (highest to lowest priority):

1. **Group KIMI.md** - Assistant identity, capabilities, skills (primary)
2. **Global KIMI.md** - Shared context across groups (secondary)
3. **Structured output instructions** - JSON format requirements
4. **User prompt** - The actual message from user

## Testing

After rebuilding the Docker image:

1. Send a message: `@Kai hola`
2. The agent should now:
   - Respond as "Kai" (not generic "Kimi Code CLI")
   - Reference skills mentioned in KIMI.md
   - Know about WhatsApp integration
   - Use the configured capabilities

## Prerequisites

This fix requires rebuilding the Docker image (see `fix/docker-python-version` branch):

```bash
cd container
docker build -t nanokimi-agent:latest .
systemctl --user restart nanokimi
```

## Expected Behavior

### Before Fix:
```
Kai: Soy Kimi Code CLI, una herramienta de línea de comandos...
No tengo conexión con WhatsApp...
```

### After Fix:
```
Kai: ¡Hola! Soy Kai, tu asistente personal. Puedo ayudarte con:
- Responder preguntas
- Buscar en la web
- Programar recordatorios
- Usar skills disponibles

¿En qué puedo ayudarte hoy?
```

## Related

- Depends on: `fix/docker-python-version` (needs image rebuild)
- Part of: Making NanoKimi work like original NanoClaw
- See also: `fix/isolated-oauth-token` for OAuth security
