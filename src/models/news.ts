export interface NewsItem {
  id: string;
  title: string;
  content: string;
  createTime: string;
  tag?: string;
  fetchedAt?: number;
  read?: boolean;
}
