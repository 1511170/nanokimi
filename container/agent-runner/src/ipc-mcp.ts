/**
 * IPC-based MCP Server for NanoKimi
 * Writes messages and tasks to files for the host process to pick up
 * 
 * Note: Simplified version for Kimi SDK (MCP server not available in Kimi SDK)
 */

import fs from 'fs';
import path from 'path';

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

export interface IpcMcpContext {
  chatJid: string;
  groupFolder: string;
  isMain: boolean;
}

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

// Simplified MCP-like interface for Kimi SDK
interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

// Tool definitions for documentation purposes
export const IPC_TOOLS = {
  send_message: {
    description: 'Send a message to the user or group.',
    parameters: {
      text: { type: 'string', description: 'The message text to send' }
    }
  },
  schedule_task: {
    description: 'Schedule a recurring or one-time task.',
    parameters: {
      prompt: { type: 'string', description: 'What the agent should do' },
      schedule_type: { type: 'string', enum: ['cron', 'interval', 'once'] },
      schedule_value: { type: 'string', description: 'Cron expression, interval ms, or timestamp' },
      context_mode: { type: 'string', enum: ['group', 'isolated'], default: 'group' },
      target_group_jid: { type: 'string', optional: true }
    }
  },
  list_tasks: {
    description: 'List all scheduled tasks.',
    parameters: {}
  },
  pause_task: {
    description: 'Pause a scheduled task.',
    parameters: {
      task_id: { type: 'string' }
    }
  },
  resume_task: {
    description: 'Resume a paused task.',
    parameters: {
      task_id: { type: 'string' }
    }
  },
  cancel_task: {
    description: 'Cancel and delete a scheduled task.',
    parameters: {
      task_id: { type: 'string' }
    }
  },
  register_group: {
    description: 'Register a new WhatsApp group (main only).',
    parameters: {
      jid: { type: 'string' },
      name: { type: 'string' },
      folder: { type: 'string' },
      trigger: { type: 'string' }
    }
  }
};

export function createIpcMcp(ctx: IpcMcpContext) {
  const { chatJid, groupFolder, isMain } = ctx;

  // Return tool execution functions
  return {
    sendMessage: (text: string): ToolResult => {
      const data = {
        type: 'message',
        chatJid,
        text,
        groupFolder,
        timestamp: new Date().toISOString()
      };

      writeIpcFile(MESSAGES_DIR, data);

      return {
        content: [{ type: 'text', text: 'Message sent.' }]
      };
    },

    scheduleTask: (
      prompt: string,
      scheduleType: 'cron' | 'interval' | 'once',
      scheduleValue: string,
      contextMode: 'group' | 'isolated' = 'group',
      targetGroupJid?: string
    ): ToolResult => {
      const targetJid = isMain && targetGroupJid ? targetGroupJid : chatJid;

      const data = {
        type: 'schedule_task',
        prompt,
        schedule_type: scheduleType,
        schedule_value: scheduleValue,
        context_mode: contextMode,
        targetJid,
        createdBy: groupFolder,
        timestamp: new Date().toISOString()
      };

      const filename = writeIpcFile(TASKS_DIR, data);

      return {
        content: [{
          type: 'text',
          text: `Task scheduled (${filename}): ${scheduleType} - ${scheduleValue}`
        }]
      };
    },

    listTasks: (): ToolResult => {
      const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

      try {
        if (!fs.existsSync(tasksFile)) {
          return {
            content: [{ type: 'text', text: 'No scheduled tasks found.' }]
          };
        }

        const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

        const tasks = isMain
          ? allTasks
          : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);

        if (tasks.length === 0) {
          return {
            content: [{ type: 'text', text: 'No scheduled tasks found.' }]
          };
        }

        const formatted = tasks.map((t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run: string }) =>
          `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`
        ).join('\n');

        return {
          content: [{ type: 'text', text: `Scheduled tasks:\n${formatted}` }]
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}`
          }]
        };
      }
    },

    pauseTask: (taskId: string): ToolResult => {
      const data = {
        type: 'pause_task',
        taskId,
        groupFolder,
        isMain,
        timestamp: new Date().toISOString()
      };

      writeIpcFile(TASKS_DIR, data);

      return {
        content: [{ type: 'text', text: `Task ${taskId} pause requested.` }]
      };
    },

    resumeTask: (taskId: string): ToolResult => {
      const data = {
        type: 'resume_task',
        taskId,
        groupFolder,
        isMain,
        timestamp: new Date().toISOString()
      };

      writeIpcFile(TASKS_DIR, data);

      return {
        content: [{ type: 'text', text: `Task ${taskId} resume requested.` }]
      };
    },

    cancelTask: (taskId: string): ToolResult => {
      const data = {
        type: 'cancel_task',
        taskId,
        groupFolder,
        isMain,
        timestamp: new Date().toISOString()
      };

      writeIpcFile(TASKS_DIR, data);

      return {
        content: [{ type: 'text', text: `Task ${taskId} cancellation requested.` }]
      };
    },

    registerGroup: (jid: string, name: string, folder: string, trigger: string): ToolResult => {
      if (!isMain) {
        return {
          content: [{ type: 'text', text: 'Only the main group can register new groups.' }],
          isError: true
        };
      }

      const data = {
        type: 'register_group',
        jid,
        name,
        folder,
        trigger,
        timestamp: new Date().toISOString()
      };

      writeIpcFile(TASKS_DIR, data);

      return {
        content: [{
          type: 'text',
          text: `Group "${name}" registered. It will start receiving messages immediately.`
        }]
      };
    }
  };
}
