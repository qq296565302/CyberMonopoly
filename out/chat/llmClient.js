"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmClient = void 0;
class LlmClient {
    constructor(config) {
        this.config = config;
    }
    async chat(messages) {
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
        const data = await resp.json();
        return data.choices?.[0]?.message?.content || '无响应';
    }
}
exports.LlmClient = LlmClient;
//# sourceMappingURL=llmClient.js.map