export interface LlmConfig {
  apiEndpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export class LlmClient {
  private config: LlmConfig;
  private currentAbort: AbortController | undefined;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  async chat(messages: [string, string][]): Promise<string> {
    if (this.currentAbort) {
      this.currentAbort.abort();
    }
    this.currentAbort = new AbortController();
    const signal = this.currentAbort.signal;

    try {
      const body = {
        model: this.config.model,
        messages: messages.map(([role, content]) => ({ role, content })),
        temperature: this.config.temperature,
      };

      const resp = await fetch(`${this.config.apiEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`LLM请求失败 (${resp.status}): ${errText}`);
      }

      const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content || '无响应';
    } finally {
      this.currentAbort = undefined;
    }
  }

  abort(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = undefined;
    }
  }
}
