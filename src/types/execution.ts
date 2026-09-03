export interface SkillExecution {
  id: string;
  skillId: string;
  skillName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  startedAt: number;
  completedAt?: number;
  steps: StepResult[];
  results: Record<string, string>;
  userInputs: Record<string, string>;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  output: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  duration?: number;
}
