import { describe, expect, it } from 'vitest';
import {
  assembleRuntimeInput,
  CORE_LEARNING_POLICY,
  TASK_CONTRACTS,
} from '../web/prompt-contract.js';

describe('assembleRuntimeInput', () => {
  const messages = [
    { role: 'user', content: 'I tried to explain closures, but I am unsure about scope.' },
    { role: 'assistant', content: 'What do you think the function remembers?' },
    { role: 'user', content: 'I think it remembers the variable after the outer call ends.' },
  ];

  it('creates one provider-neutral contract from policy, task, and conversation', () => {
    const input = assembleRuntimeInput(messages, { task: 'feedback_review' });

    expect(input.systemPrompt).toContain(CORE_LEARNING_POLICY);
    expect(input.systemPrompt).toContain(TASK_CONTRACTS.feedback_review);
    expect(input.messages).toEqual(messages);
    expect(input.cliPrompt).toContain('## Core learning policy');
    expect(input.cliPrompt).toContain('## Task contract: feedback_review');
    expect(input.cliPrompt).toContain('I think it remembers the variable');
  });

  it('uses the general contract when no task is supplied', () => {
    const input = assembleRuntimeInput([{ role: 'user', content: 'Help me learn TypeScript.' }]);

    expect(input.task).toBe('general');
    expect(input.systemPrompt).toContain(TASK_CONTRACTS.general);
  });

  it('filters empty messages and preserves role-labelled conversation for CLI adapters', () => {
    const input = assembleRuntimeInput([
      { role: 'user', content: '  ' },
      { role: 'assistant', content: 'Let us start with your goal.' },
      { role: 'user', content: 'I want to understand generics.' },
    ]);

    expect(input.messages).toEqual([
      { role: 'assistant', content: 'Let us start with your goal.' },
      { role: 'user', content: 'I want to understand generics.' },
    ]);
    expect(input.cliPrompt).not.toContain('  \n');
    expect(input.cliPrompt).toContain('Assistant: Let us start with your goal.');
    expect(input.cliPrompt).toContain('Learner: I want to understand generics.');
  });

  it('rejects unknown task contracts instead of silently changing learning behavior', () => {
    expect(() => assembleRuntimeInput(messages, { task: 'unreviewed_mode' }))
      .toThrow('Unknown learning task contract: unreviewed_mode');
  });
});
