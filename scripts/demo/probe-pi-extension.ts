import extension from '../pi-extension/index.ts';

type Handler = (event: any, ctx: any) => any;

const listeners = new Map<string, Handler[]>();
const commands = new Map<string, any>();

const pi = {
  on(name: string, handler: Handler) {
    const list = listeners.get(name) ?? [];
    list.push(handler);
    listeners.set(name, list);
  },
  registerCommand(name: string, spec: any) {
    commands.set(name, spec);
  },
};

const ctx = {
  ui: {
    theme: {
      fg(_style: string, text: string) {
        return text;
      },
    },
    setStatus(name: string, value: string | undefined) {
      console.log('setStatus', name, value ?? '<unset>');
    },
    notify(message: string, level: string) {
      console.log('notify', level, message);
    },
  },
  getContextUsage() {
    return { percent: 37 };
  },
};

async function emit(name: string, event: any = {}) {
  const list = listeners.get(name) ?? [];
  for (const handler of list) {
    await handler(event, ctx);
  }
}

extension(pi as any);

console.log('commands', [...commands.keys()].join(','));
await emit('session_start', {});
await emit('agent_start', {});
await new Promise((resolve) => setTimeout(resolve, 2000));
await emit('message_update', {});
await new Promise((resolve) => setTimeout(resolve, 1000));
await emit('tool_execution_start', { toolName: 'read', args: { path: 'src/glimpse.mjs' } });
await new Promise((resolve) => setTimeout(resolve, 1000));
await emit('agent_end', {});
await new Promise((resolve) => setTimeout(resolve, 4000));
await emit('session_shutdown', {});
console.log('probe done');
