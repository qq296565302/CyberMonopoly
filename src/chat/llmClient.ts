export interface LlmConfig {
  apiEndpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export class LlmClient {
  private config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  async chat(messages: [string, string][]): Promise<string> {
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
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LLM请求失败 (${resp.status}): ${errText}`);
    }

    const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content || '无响应';
  }
}
