self.onmessage = async (e) => {
  const { code, nodes, messageId, inputs } = e.data;

  try {
    // create the ai function
    const ai = (prompt: string, slotRef: string, mode?: string, images?: string[]) => {
      return new Promise((resolve, reject) => {
        const callId = Math.random().toString(36).substring(7);
        const aiListener = (evt: MessageEvent) => {
          if (evt.data.type === 'AI_RESULT' && evt.data.callId === callId) {
            self.removeEventListener('message', aiListener);
            if (evt.data.error) {
              reject(new Error(evt.data.error));
            } else {
              resolve(evt.data.result);
            }
          }
        };
        self.addEventListener('message', aiListener);
        self.postMessage({ type: 'CALL_AI', prompt, callId, slotRef, mode, images });
      });
    };

    // resolveInput: 从主线程传入的已解析 inputs 中取值
    const resolveInput = (id: string): string | string[] => {
      if (!inputs || !(id in inputs)) {
        throw new Error(`Input "${id}" 未在 Action 的「处理器输入」中声明，或解析失败。`);
      }
      return inputs[id];
    };

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('nodes', 'ai', 'resolveInput', code);
    
    let result = await fn(nodes, ai, resolveInput);
    
    // Ensure format is compatible
    if (!Array.isArray(result)) {
      if (typeof result === 'string') {
        result = [{ content: result }];
      } else if (result && typeof result === 'object') {
        // If it looks like a graph config
        if (result.nodes || result.edges) {
          // keep as is
        } else if (result.content) {
          result = [result];
        } else {
          result = [{ content: JSON.stringify(result) }];
        }
      } else {
        result = [{ content: JSON.stringify(result) }];
      }
    }

    self.postMessage({ type: 'EXECUTE_RESULT', result, messageId });
  } catch (error: any) {
    self.postMessage({ type: 'EXECUTE_ERROR', error: error.message || String(error), messageId });
  }
};
