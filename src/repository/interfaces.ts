export type ExpertVideo = {
  name: string;
  videoId: string;
  topic: string;
  title?: string;
  publishedAt?: string;
};

export interface SupadataResponse {
  status?: string;
  content?: SupadataContent[];
  error?: SupadataError;
  lang?: string;
  availableLangs?: string[];
}

export interface SupadataError {
  error?: string;
  message?: string;
  details?: any;
  documentation_url?: string;
}

export interface SupadataContent {
  text: string;
  offset: number;
  duration: number;
  lang: string;
}
