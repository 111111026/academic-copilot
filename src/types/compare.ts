export interface Comparison {
  id: string;
  paperIds: string[];
  /** 生成时的标题快照：论文被删除后，历史对比记录仍能读得出对比的是哪几篇 */
  titles: string[];
  /** 模型输出的 Markdown 对比表原文 */
  result: string;
  createdAt: number;
}
