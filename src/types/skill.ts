export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'reading' | 'writing' | 'research' | 'data' | 'communication' | 'custom';
  version: string;
  author: string;
  tags: string[];
  inputs: SkillInput[];
  steps: SkillStep[];
  output: SkillOutput;
  isBuiltin: boolean;
  requires?: {
    paperSelection?: boolean;
    pdfUpload?: boolean;
  };
}

export interface SkillInput {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'paperSelector';
  placeholder?: string;
  required: boolean;
  options?: string[];
  defaultValue?: string;
  description?: string;
}

export interface SkillStep {
  id: string;
  name: string;
  description?: string;
  inputFrom: {
    source: 'userInput' | 'previousStep' | 'constant';
    key?: string;
    value?: string;
  }[];
  promptTemplate: string;
  optional?: boolean;
}

export interface SkillOutput {
  format: 'text' | 'markdown' | 'table' | 'cards' | 'slides';
  sections?: {
    id: string;
    title: string;
    type: 'text' | 'list' | 'table';
  }[];
  exportFormats?: ('md' | 'csv')[];
}
