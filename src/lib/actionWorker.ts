self.onmessage = async (e) => {
  const { code, nodes, messageId } = e.data;

  try {
    // create the ai function
    const ai = (prompt: string, modelId: string, mode?: string) => {
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
        self.postMessage({ type: 'CALL_AI', prompt, callId, modelId, mode });
      });
    };

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('nodes', 'ai', code);
    
    let result = await fn(nodes, ai);
    
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
