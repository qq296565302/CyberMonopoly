/**
 * 工具执行器 - 薄代理层
 *
 * 此模块作为向后兼容的入口，所有实现已迁移到：
 * - 类型定义 -> tools/base.ts
 * - 安全函数 -> utils/security.ts
 * - 工具实现 -> tools/*.ts
 * - 执行逻辑 -> tools/index.ts
 */

// 从新位置重新导出所有公开接口，保持 import 路径不变
export {
  ToolResult,
  ToolDefinition,
  ToolCall,
  ToolCallResult,
} from './tools/base';

export {
  getToolDefinitions,
  executeTool,
  executeToolCalls,
} from './tools/index';

export {
  sanitizeForPrompt,
  sanitizeToolOutput,
  sanitizeToolData,
} from '../utils/security';
