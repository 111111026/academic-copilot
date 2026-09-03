import type { Skill } from '@/types/skill';

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'opening-report',
    name: '开题报告生成器',
    description: '从研究想法到完整开题报告：选题背景、文献综述框架、研究方案、进度安排，四步生成。',
    icon: '📋',
    category: 'writing',
    version: '1.0.0',
    author: '研途智伴',
    tags: ['开题', '研究方案', '综述'],
    inputs: [
      { id: 'topic', label: '论文题目', type: 'text', required: true, placeholder: '例如：基于对比学习的跨模态检索方法研究' },
      { id: 'discipline', label: '学科方向', type: 'text', required: true, placeholder: '例如：计算机科学与技术 / 教育学 / 材料科学' },
      { id: 'foundation', label: '已有基础', type: 'textarea', required: true, placeholder: '已读文献、预实验结果、掌握的方法或数据…' },
      { id: 'requirements', label: '院校特殊要求（选填）', type: 'textarea', required: false, placeholder: '字数、格式、必须包含的章节等' },
    ],
    steps: [
      {
        id: 'background',
        name: '选题背景与意义',
        inputFrom: [
          { source: 'userInput', key: 'topic' },
          { source: 'userInput', key: 'discipline' },
          { source: 'userInput', key: 'foundation' },
        ],
        promptTemplate: `你是{discipline}领域的资深研究顾问。请为以下论文题目撰写开题报告的「选题背景与研究意义」部分。

论文题目：{topic}
已有基础：{foundation}

输出要求：
## 选题背景
（学科发展脉络、现实需求、技术瓶颈，3-4 段）
## 研究意义
### 理论意义
### 实践意义
（各 2-3 点，具体到本研究而非泛泛而谈）`,
      },
      {
        id: 'review',
        name: '文献综述框架',
        inputFrom: [
          { source: 'userInput', key: 'topic' },
          { source: 'userInput', key: 'discipline' },
          { source: 'previousStep', key: 'background' },
        ],
        promptTemplate: `基于以下选题背景，为{discipline}领域的论文「{topic}」生成文献综述框架。

选题背景：
{background}

输出要求：
## 国内外研究现状
### 方向一：（与题目最相关的子领域）
- 代表性工作与核心结论（列出 3-5 条，标注作者/年份占位）
- 现有不足
### 方向二：
（同上结构）
### 方向三：
（同上结构）
## 研究述评
（总结现有研究的共性问题，引出本研究的切入点，1-2 段）

注意：文献条目用「[作者, 年份]」占位，不要编造具体论文标题。`,
      },
      {
        id: 'plan',
        name: '研究方案与技术路线',
        inputFrom: [
          { source: 'userInput', key: 'topic' },
          { source: 'userInput', key: 'foundation' },
          { source: 'previousStep', key: 'review' },
        ],
        promptTemplate: `基于以下文献综述框架，为论文「{topic}」设计研究方案。

文献综述：
{review}
已有基础：{foundation}

输出要求：
## 研究目标
（1 段总目标 + 3-4 条具体目标）
## 研究内容
（分 3-4 个模块，每模块：内容概述、关键问题、预期产出）
## 技术路线
（用文字描述流程图：阶段→步骤→方法→验证，标明各阶段的输入输出）
## 研究方法
（具体方法名称、适用理由、实施步骤）
## 创新点
（2-3 条，每条一句话概括 + 一句话说明为什么是创新）`,
      },
      {
        id: 'schedule',
        name: '进度安排与参考文献',
        inputFrom: [
          { source: 'userInput', key: 'topic' },
          { source: 'previousStep', key: 'plan' },
          { source: 'userInput', key: 'requirements' },
        ],
        promptTemplate: `基于以下研究方案，为论文「{topic}」生成进度安排。

研究方案：
{plan}
院校要求：{requirements}

输出要求：
## 进度安排
（按学期/月份列表，每阶段：时间区间、任务内容、预期成果、对应研究内容模块）
## 预期成果
（论文、专利、软件著作权等，按院校常见要求列 2-4 条）
## 参考文献建议
（列出 8-12 条「[作者, 年份] 方向关键词」占位条目，覆盖综述框架里的三个方向）`,
      },
    ],
    output: {
      format: 'markdown',
      sections: [
        { id: 'background', title: '选题背景与意义', type: 'text' },
        { id: 'review', title: '文献综述框架', type: 'text' },
        { id: 'plan', title: '研究方案', type: 'text' },
        { id: 'schedule', title: '进度安排', type: 'text' },
      ],
      exportFormats: ['md'],
    },
    isBuiltin: true,
  },

  {
    id: 'literature-review',
    name: '文献综述工作流',
    description: '批量文献 → 逐篇总结 → 主题聚类 → 系统性综述框架，三步完成。',
    icon: '📚',
    category: 'reading',
    version: '1.0.0',
    author: '研途智伴',
    tags: ['综述', '文献', '聚类'],
    inputs: [
      { id: 'papers', label: '文献内容', type: 'textarea', required: true, placeholder: '粘贴多篇文献的标题+摘要（或结构化总结），每篇之间用 --- 分隔' },
      { id: 'theme', label: '综述主题', type: 'text', required: true, placeholder: '例如：跨模态检索中的对比学习方法' },
      { id: 'focus', label: '关注维度（选填）', type: 'textarea', required: false, placeholder: '例如：方法演进脉络、数据集对比、性能指标变化' },
    ],
    steps: [
      {
        id: 'summaries',
        name: '逐篇结构化总结',
        inputFrom: [
          { source: 'userInput', key: 'papers' },
          { source: 'userInput', key: 'theme' },
        ],
        promptTemplate: `你是学术文献分析助理。请对以下每篇文献输出结构化总结。

综述主题：{theme}
文献列表：
{papers}

对每篇输出：
### [序号] 标题
- **研究问题**：一句话
- **方法**：核心方法/模型名称 + 关键设计
- **数据**：数据集/样本
- **主要结论**：1-2 句
- **与主题的关联**：这篇文献对综述主题的贡献点

用 --- 分隔的每段作为一篇文献处理。如果某段信息不足以判断，标注「信息不足」。`,
      },
      {
        id: 'clustering',
        name: '主题聚类',
        inputFrom: [
          { source: 'userInput', key: 'theme' },
          { source: 'userInput', key: 'focus' },
          { source: 'previousStep', key: 'summaries' },
        ],
        promptTemplate: `基于以下逐篇总结，将文献按研究主题聚类。

综述主题：{theme}
关注维度：{focus}
逐篇总结：
{summaries}

输出要求：
## 聚类结果
### 类别一：（命名）
- 包含文献：[序号列表]
- 共同特征：
- 代表性方法：
- 局限性：
### 类别二：
（同上结构，2-4 个类别）

## 类别间关系
（演进关系、互补关系、竞争关系，用 1-2 段说明）

## 研究空白
（现有类别未覆盖的问题，2-3 条）`,
      },
      {
        id: 'framework',
        name: '综述框架',
        inputFrom: [
          { source: 'userInput', key: 'theme' },
          { source: 'previousStep', key: 'clustering' },
        ],
        promptTemplate: `基于以下聚类结果，生成系统性文献综述的写作框架。

综述主题：{theme}
聚类结果：
{clustering}

输出要求：
## 综述标题建议
（2-3 个备选）
## 摘要框架
（背景→问题→方法→发现→结论，各一句话占位）
## 正文结构
### 1. 引言
- 写作要点（3-4 条）
### 2. 方法/背景概述
- 写作要点
### 3-N. 各主题章节
（每章：覆盖文献、论述逻辑、需要的对比表格/图）
### N+1. 讨论与未来方向
- 写作要点
### N+2. 结论
- 写作要点
## 建议的图表
（对比表、时间线图、分类框架图等，各附标题和内容说明）`,
      },
    ],
    output: {
      format: 'markdown',
      sections: [
        { id: 'summaries', title: '逐篇总结', type: 'text' },
        { id: 'clustering', title: '主题聚类', type: 'text' },
        { id: 'framework', title: '综述框架', type: 'text' },
      ],
      exportFormats: ['md'],
    },
    isBuiltin: true,
    requires: { paperSelection: true },
  },

  {
    id: 'deep-reading',
    name: '论文精读器',
    description: '深度拆解一篇论文：结构分析 → 批判性评价 → 阅读笔记，三步完成。',
    icon: '🔍',
    category: 'reading',
    version: '1.0.0',
    author: '研途智伴',
    tags: ['精读', '批判性分析', '笔记'],
    inputs: [
      { id: 'content', label: '论文内容', type: 'textarea', required: true, placeholder: '粘贴论文全文、摘要+关键章节，或文献工作台里已生成的结构化总结' },
      { id: 'focus', label: '关注重点', type: 'select', required: true, options: ['方法与实验设计', '创新点与贡献', '局限与可改进之处', '与我研究的关联', '全面精读'], defaultValue: '全面精读' },
      { id: 'myTopic', label: '我的研究方向（选填）', type: 'text', required: false, placeholder: '用于分析这篇论文与你研究的关联' },
    ],
    steps: [
      {
        id: 'structure',
        name: '结构拆解',
        inputFrom: [
          { source: 'userInput', key: 'content' },
          { source: 'userInput', key: 'focus' },
        ],
        promptTemplate: `你是学术论文分析专家。请对以下论文进行结构拆解。

关注重点：{focus}
论文内容：
{content}

输出要求：
## 基本信息
- 标题 / 作者 / 年份 / 期刊或会议
## 研究问题
（原文的核心问题，用一句话概括）
## 论证结构
（按论文章节，列出：章节→核心论点→支撑证据→与主线的关系）
## 方法详解
- 研究设计类型
- 数据/样本
- 关键步骤与参数
- 评估指标
## 核心结论
（原文声称的贡献，逐条列出）
## 关键图表解读
（列出 2-3 个最重要的图表，说明它证明了什么）`,
      },
      {
        id: 'critique',
        name: '批判性分析',
        inputFrom: [
          { source: 'userInput', key: 'focus' },
          { source: 'userInput', key: 'myTopic' },
          { source: 'previousStep', key: 'structure' },
        ],
        promptTemplate: `基于以下结构拆解，对这篇论文进行批判性分析。

关注重点：{focus}
读者研究方向：{myTopic}
结构拆解：
{structure}

输出要求：
## 优势
（3-4 条，具体到论文本身而非泛泛夸赞）
## 局限与疑问
（3-5 条，每条：问题描述→为什么是问题→可能的影响）
## 方法论审视
- 内部效度：
- 外部效度：
- 可复现性：
## 与现有文献的关系
（是增量改进还是范式突破？与哪些工作形成对话？）
## 对我研究的启示
（如果提供了研究方向：可借鉴什么、应避免什么、可能的合作点）`,
      },
      {
        id: 'notes',
        name: '阅读笔记',
        inputFrom: [
          { source: 'previousStep', key: 'structure' },
          { source: 'previousStep', key: 'critique' },
        ],
        promptTemplate: `基于以下结构拆解和批判性分析，生成一份精炼的阅读笔记。

结构拆解：
{structure}
批判性分析：
{critique}

输出要求（控制在 500 字以内，方便日后快速回顾）：
## 一句话总结
## 核心贡献（≤3 条）
## 方法关键词（用于检索，5-8 个）
## 值得引用的论点（原文表述 + 可引用场景）
## 我的批注（局限、疑问、后续行动）
## 相关文献线索（论文引用或对比的重要工作，[作者, 年份] 格式）`,
      },
    ],
    output: {
      format: 'markdown',
      sections: [
        { id: 'structure', title: '结构拆解', type: 'text' },
        { id: 'critique', title: '批判性分析', type: 'text' },
        { id: 'notes', title: '阅读笔记', type: 'text' },
      ],
      exportFormats: ['md'],
    },
    isBuiltin: true,
    requires: { paperSelection: true },
  },

  {
    id: 'stat-consultant',
    name: '实验设计顾问',
    description: '从研究假设到完整实验方案：变量设计 → 样本量估算 → 统计方法选择，三步完成。',
    icon: '🧪',
    category: 'data',
    version: '1.0.0',
    author: '研途智伴',
    tags: ['实验设计', '统计', '样本量'],
    inputs: [
      { id: 'hypothesis', label: '研究假设', type: 'textarea', required: true, placeholder: '例如：对比学习损失能显著提升跨模态检索的 Recall@10' },
      { id: 'studyType', label: '研究类型', type: 'select', required: true, options: ['实验研究（随机对照）', '准实验研究', '观察性研究', '调查研究', '计算/仿真研究'], defaultValue: '实验研究（随机对照）' },
      { id: 'constraints', label: '现实约束', type: 'textarea', required: true, placeholder: '可用被试数、设备、时间、经费、数据获取难度等' },
      { id: 'variables', label: '已知变量（选填）', type: 'textarea', required: false, placeholder: '自变量、因变量、协变量、调节变量等' },
    ],
    steps: [
      {
        id: 'design',
        name: '变量与实验设计',
        inputFrom: [
          { source: 'userInput', key: 'hypothesis' },
          { source: 'userInput', key: 'studyType' },
          { source: 'userInput', key: 'variables' },
          { source: 'userInput', key: 'constraints' },
        ],
        promptTemplate: `你是实验设计顾问。请基于以下研究假设设计实验方案。

研究假设：{hypothesis}
研究类型：{studyType}
已知变量：{variables}
现实约束：{constraints}

输出要求：
## 操作化定义
- 自变量：（名称、水平数、操作方式）
- 因变量：（名称、测量指标、测量工具/方法）
- 控制变量：（需要控制的混淆因素及控制方式）
## 实验设计
- 设计类型：（如 2×3 混合设计）
- 分组方案：
- 实验流程：（按时间顺序列出步骤）
## 效度威胁与应对
（内部效度、外部效度各 2-3 条威胁 + 应对措施）`,
      },
      {
        id: 'sample',
        name: '样本量估算',
        inputFrom: [
          { source: 'userInput', key: 'hypothesis' },
          { source: 'userInput', key: 'constraints' },
          { source: 'previousStep', key: 'design' },
        ],
        promptTemplate: `基于以下实验设计，进行样本量估算。

研究假设：{hypothesis}
实验设计：
{design}
现实约束：{constraints}

输出要求：
## 效应量预估
- 依据：（文献报道 / 预实验 / 领域惯例）
- 预估效应量：（Cohen's d / f / η² 等，给出具体数值和来源）
## 样本量计算
- 统计检验力：（通常 0.80）
- 显著性水平：（通常 0.05）
- 计算方法：（G*Power / 公式 / 模拟）
- 每组所需样本量：
- 总样本量（含 10-20% 脱落率）：
## 可行性判断
（对照现实约束：如果样本量不可达，给出替代方案——调整效应量预期、改用更敏感的指标、增加测量次数等）
## 估算代码
（Python 或 R 的 statsmodels/pwr 代码）`,
      },
      {
        id: 'analysis',
        name: '统计分析方案',
        inputFrom: [
          { source: 'userInput', key: 'hypothesis' },
          { source: 'previousStep', key: 'design' },
          { source: 'previousStep', key: 'sample' },
        ],
        promptTemplate: `基于以下实验设计和样本量方案，制定完整的统计分析计划。

研究假设：{hypothesis}
实验设计：
{design}
样本量方案：
{sample}

输出要求：
## 描述性统计
（需要报告的指标：M, SD, n, 缺失值处理方式）
## 前提假设检验
（正态性、方差齐性、独立性等，各附检验方法和判断标准）
## 主要分析
- 方法：
- 模型/公式：
- 效应量指标：
- 事后比较（如适用）：
## 辅助/探索性分析
（调节效应、中介效应、亚组分析等）
## 结果报告模板
（按 APA 或国标格式，给出「F(df1, df2) = ___, p = ___, d = ___」的占位模板）
## 分析代码
（Python 或 R，含数据清洗→前提检验→主分析→效应量→可视化）`,
      },
    ],
    output: {
      format: 'markdown',
      sections: [
        { id: 'design', title: '实验设计', type: 'text' },
        { id: 'sample', title: '样本量估算', type: 'text' },
        { id: 'analysis', title: '统计分析方案', type: 'text' },
      ],
      exportFormats: ['md'],
    },
    isBuiltin: true,
  },

  {
    id: 'ppt-generator',
    name: '组会 PPT 生成',
    description: '研究进展 → 逐页 PPT 大纲 + 讲稿，两步完成。',
    icon: '🎤',
    category: 'communication',
    version: '1.0.0',
    author: '研途智伴',
    tags: ['PPT', '组会', '汇报'],
    inputs: [
      { id: 'progress', label: '研究进展', type: 'textarea', required: true, placeholder: '本阶段完成的工作、数据、发现、遇到的问题…' },
      { id: 'duration', label: '汇报时长', type: 'select', required: true, options: ['5 分钟', '10 分钟', '15 分钟', '20 分钟', '30 分钟'], defaultValue: '10 分钟' },
      { id: 'audience', label: '听众', type: 'select', required: true, options: ['导师与同门', '仅导师', '跨方向听众', '答辩委员会', '学术会议'], defaultValue: '导师与同门' },
      { id: 'emphasis', label: '重点强调（选填）', type: 'text', required: false, placeholder: '例如：突出实验结果、强调下一步计划、请求指导' },
    ],
    steps: [
      {
        id: 'outline',
        name: 'PPT 逐页大纲',
        inputFrom: [
          { source: 'userInput', key: 'progress' },
          { source: 'userInput', key: 'duration' },
          { source: 'userInput', key: 'audience' },
          { source: 'userInput', key: 'emphasis' },
        ],
        promptTemplate: `你是学术汇报顾问。请根据以下研究进展生成组会 PPT 逐页大纲。

研究进展：
{progress}
汇报时长：{duration}
听众：{audience}
重点强调：{emphasis}

输出要求（按时长分配合理页数，10 分钟约 8-12 页）：
## 第1页：标题页
- 标题：
- 副标题/日期：
## 第2页：汇报框架
- 要点：
## 第3-N页：正文
（每页：页面标题 + 3-5 个要点 + 建议的图表/可视化）
## 最后一页：总结与下一步
- 本阶段结论：
- 下阶段计划：
- 需要讨论的问题：

每页标注建议停留时间。`,
      },
      {
        id: 'script',
        name: '逐页讲稿',
        inputFrom: [
          { source: 'userInput', key: 'audience' },
          { source: 'userInput', key: 'emphasis' },
          { source: 'previousStep', key: 'outline' },
        ],
        promptTemplate: `基于以下 PPT 大纲，为每页撰写讲稿。

听众：{audience}
重点强调：{emphasis}
PPT 大纲：
{outline}

输出要求：
对每页输出：
### 第N页：（标题）
**讲稿**：（口语化但专业的表述，60-120 字/页，含过渡句）
**备注**：（可能被问到的问题 + 简要回答思路）

整体风格：
- 对导师与同门：可以直接、技术性强
- 对跨方向听众：需要更多背景铺垫
- 对答辩委员会：需要强调创新性和严谨性

最后附：
## 时间控制建议
（哪些页可以快速带过，哪些页需要展开）
## 可能的提问与应对
（3-5 个最可能被问到的问题 + 回答要点）`,
      },
    ],
    output: {
      format: 'slides',
      sections: [
        { id: 'outline', title: 'PPT 大纲', type: 'text' },
        { id: 'script', title: '逐页讲稿', type: 'text' },
      ],
      exportFormats: ['md'],
    },
    isBuiltin: true,
  },
];

export function getBuiltinSkill(id: string): Skill | undefined {
  return BUILTIN_SKILLS.find((s) => s.id === id);
}
