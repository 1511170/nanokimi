/**
 * NanoKimi Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 */

import fs from 'fs';
import path from 'path';
import { createSession, KimiPaths } from '@moonshot-ai/kimi-agent-sdk';
import type { Session, StreamEvent, RunResult, ContentPart } from '@moonshot-ai/kimi-agent-sdk';
import { createIpcMcp } from './ipc-mcp.js';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
}

interface AgentResponse {
  outputType: 'message' | 'log';
  userMessage?: string;
  internalLog?: string;
}

const AGENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    outputType: {
      type: 'string',
      enum: ['message', 'log'],
      description: '"message": the userMessage field contains a message to send to the user or group. "log": the output will not be sent to the user or group.',
    },
    userMessage: {
      type: 'string',
      description: 'A message to send to the user or group. Include when outputType is "message".',
    },
    internalLog: {
      type: 'string',
      description: 'Information that will be logged internally but not sent to the user or group.',
    },
  },
  required: ['outputType'],
} as const;

interface ContainerOutput {
  status: 'success' | 'error';
  result: AgentResponse | null;
  newSessionId?: string;
  error?: string;
}

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

interface SessionsIndex {
  entries: SessionEntry[];
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const OUTPUT_START_MARKER = '---NANOKIMI_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOKIMI_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function getSessionSummary(sessionId: string, transcriptPath: string): string | null {
  // sessions-index.json is in the same directory as the transcript
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    log(`Sessions index not found at ${indexPath}`);
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entry = index.entries.find(e => e.sessionId === sessionId);
    if (entry?.summary) {
      return entry.summary;
    }
  } catch (err) {
    log(`Failed to read sessions index: ${err instanceof Error ? err.message : String(err)}`);
  }

  return null;
}

/**
 * Parse session events from Kimi's session storage
 * Reads the events.jsonl file from the session directory
 */
async function parseSessionEvents(workDir: string, sessionId: string): Promise<StreamEvent[]> {
  const eventsPath = path.join(workDir, '.kimi', 'sessions', sessionId, 'events.jsonl');
  
  if (!fs.existsSync(eventsPath)) {
    log(`Events file not found at ${eventsPath}`);
    return [];
  }

  const events: StreamEvent[] = [];
  const content = fs.readFileSync(eventsPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

/**
 * Archive the full transcript to conversations/ before compaction.
 * Note: Kimi SDK doesn't have the same PreCompact hook mechanism as Claude SDK.
 * This functionality is handled differently or can be implemented via session events.
 */
async function archiveTranscript(sessionId: string, workDir: string): Promise<void> {
  try {
    // Parse session events from Kimi's session storage
    const events = await parseSessionEvents(workDir, sessionId);
    
    if (events.length === 0) {
      log('No events to archive');
      return;
    }

    // Extract messages from events
    const messages = extractMessagesFromEvents(events);
    
    if (messages.length === 0) {
      log('No messages to archive');
      return;
    }

    const summary = getSessionSummary(sessionId, path.join(workDir, '.kimi', 'sessions', sessionId));
    const name = summary ? sanitizeFilename(summary) : generateFallbackName();

    const conversationsDir = '/workspace/group/conversations';
    fs.mkdirSync(conversationsDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${name}.md`;
    const filePath = path.join(conversationsDir, filename);

    const markdown = formatTranscriptMarkdown(messages, summary);
    fs.writeFileSync(filePath, markdown);

    log(`Archived conversation to ${filePath}`);
  } catch (err) {
    log(`Failed to archive transcript: ${err instanceof Error ? err.message : String(err)}`);
  }
}



interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function extractMessagesFromEvents(events: StreamEvent[]): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  
  for (const event of events) {
    if (event.type === 'TurnBegin' && event.payload?.user_input) {
      const userInput = event.payload.user_input;
      // Handle both string and ContentPart array
      if (typeof userInput === 'string') {
        messages.push({ role: 'user', content: userInput });
      } else if (Array.isArray(userInput)) {
        // Extract text from ContentPart array
        const textParts = userInput
          .filter((part): part is ContentPart => part && typeof part === 'object')
          .map(part => part.type === 'text' ? part.text : '')
          .filter(text => text)
          .join('\n');
        if (textParts) {
          messages.push({ role: 'user', content: textParts });
        }
      }
    } else if (event.type === 'ContentPart' && event.payload) {
      const payload = event.payload as ContentPart;
      if (payload.type === 'text' && payload.text) {
        messages.push({ role: 'assistant', content: payload.text });
      }
    }
  }
  
  return messages;
}

function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
}

function formatTranscriptMarkdown(messages: ParsedMessage[], title?: string | null): string {
  const now = new Date();
  const formatDateTime = (d: Date) => d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const lines: string[] = [];
  lines.push(`# ${title || 'Conversation'}`);
  lines.push('');
  lines.push(`Archived: ${formatDateTime(now)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : 'Assistant';
    const content = msg.content.length > 2000
      ? msg.content.slice(0, 2000) + '...'
      : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Extract JSON response from text content
 * Kimi SDK doesn't have built-in structured output like Claude SDK,
 * so we need to extract JSON from text responses.
 */
function extractJsonFromText(text: string): AgentResponse | null {
  try {
    // Try to find JSON in code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    if (codeBlockMatch) {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed.outputType) {
        return parsed as AgentResponse;
      }
    }
    
    // Try to find raw JSON object
    const jsonMatch = text.match(/({[\s\S]*"outputType"[\s\S]*})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.outputType) {
        return parsed as AgentResponse;
      }
    }
  } catch {
    // JSON parsing failed, fall through
  }
  return null;
}

async function main(): Promise<void> {
  let input: ContainerInput;

  try {
    const stdinData = await readStdin();
    input = JSON.parse(stdinData);
    log(`Received input for group: ${input.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  const ipcMcp = createIpcMcp({
    chatJid: input.chatJid,
    groupFolder: input.groupFolder,
    isMain: input.isMain
  });

  let result: AgentResponse | null = null;
  let newSessionId: string | undefined;

  // Add context for scheduled tasks
  let prompt = input.prompt;
  if (input.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${input.prompt}`;
  }

  // Load global KIMI.md as additional system context (shared across all groups)
  const globalKimiMdPath = '/workspace/global/KIMI.md';
  let globalKimiMd: string | undefined;
  if (!input.isMain && fs.existsSync(globalKimiMdPath)) {
    globalKimiMd = fs.readFileSync(globalKimiMdPath, 'utf-8');
  }

  // Append instructions for structured output
  const structuredOutputPrompt = `${prompt}

IMPORTANT: You must respond with a JSON object in this exact format:
{
  "outputType": "message" | "log",
  "userMessage": "your response to the user (only if outputType is 'message')",
  "internalLog": "optional internal log information"
}

Use "outputType": "message" when you want to send a response to the user.
Use "outputType": "log" when you only need to log internally without messaging the user.`;

  try {
    log('Starting agent...');

    const session = createSession({
      workDir: '/workspace/group',
      sessionId: input.sessionId,
      model: 'kimi-code',
      yoloMode: true,  // Auto-approve tool calls (similar to bypassPermissions)
      thinking: false,
    });

    newSessionId = session.sessionId;
    log(`Session initialized: ${newSessionId}`);

    const turn = session.prompt(globalKimiMd 
      ? `${globalKimiMd}\n\n${structuredOutputPrompt}` 
      : structuredOutputPrompt);

    let fullResponse = '';

    for await (const event of turn) {
      if (event.type === 'ContentPart') {
        const payload = event.payload as ContentPart;
        if (payload.type === 'text') {
          fullResponse += payload.text;
        }
      } else if (event.type === 'ToolCall') {
        log(`Tool called: ${event.payload.function?.name}`);
      } else if (event.type === 'ToolResult') {
        log(`Tool result received`);
      } else if (event.type === 'CompactionBegin') {
        log('Context compaction started');
        // Archive transcript before compaction
        if (newSessionId) {
          await archiveTranscript(newSessionId, '/workspace/group');
        }
      } else if (event.type === 'CompactionEnd') {
        log('Context compaction ended');
      }
    }

    // Get the final result
    const runResult: RunResult = await turn.result;
    log(`Agent completed with status: ${runResult.status}`);

    // Try to extract JSON response
    const jsonResponse = extractJsonFromText(fullResponse);
    
    if (jsonResponse) {
      result = jsonResponse;
      if (result.outputType === 'message' && !result.userMessage) {
        log('Warning: outputType is "message" but userMessage is missing, treating as "log"');
        result = { outputType: 'log', internalLog: result.internalLog };
      }
    } else {
      // Fallback: treat full response as user message
      result = { outputType: 'message', userMessage: fullResponse.trim() };
    }

    log(`Agent result: outputType=${result.outputType}${result.internalLog ? `, log=${result.internalLog}` : ''}`);

    // Close session
    await session.close();

    log('Agent completed successfully');
    writeOutput({
      status: 'success',
      result: result ?? { outputType: 'log' },
      newSessionId
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId,
      error: errorMessage
    });
    process.exit(1);
  }
}

main();
