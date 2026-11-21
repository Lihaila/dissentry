export type Protocol = 'openai' | 'anthropic' | 'google';

export interface Profile {
  id: string;
  /** Lowercase handle used for @mentions, e.g. "claude". */
  handle: string;
  name: string;
  color: string;
  presetId: string;
  protocol: Protocol;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  /** Route through the local Dissentry server (avoids CORS). Ignored when no server is present. */
  useProxy: boolean;
  systemPrompt: string;
  enabled: boolean;
  /** Reviews other models' answers and writes notes. */
  isChecker: boolean;
  createdAt: number;
}

export type PostStatus = 'streaming' | 'done' | 'error' | 'stopped';

export interface Post {
  id: string;
  kind: 'user' | 'model';
  profileId?: string;
  text: string;
  parentId?: string;
  quoteOfId?: string;
  rootId: string;
  status: PostStatus;
  error?: string;
  /** Set when this post is the author's response to a note. */
  respondsToNoteId?: string;
  createdAt: number;
}

export type Severity = 'minor' | 'major' | 'critical';
export type NoteStatus = 'open' | 'accepted' | 'dismissed';

export interface Note {
  id: string;
  postId: string;
  /** Checker who wrote it first. */
  profileId: string;
  /** Other checkers who independently flagged the same claim. */
  agreeProfileIds: string[];
  claim: string;
  correction: string;
  severity: Severity;
  status: NoteStatus;
  responsePostId?: string;
  createdAt: number;
}

export type Verdict = 'pending' | 'ok' | 'note' | 'error';

export interface Check {
  postId: string;
  profileId: string;
  verdict: Verdict;
  error?: string;
  createdAt: number;
}

export interface CheckNoteDraft {
  claim: string;
  correction: string;
  severity: Severity;
}

export interface CheckResult {
  verdict: 'ok' | 'note';
  notes: CheckNoteDraft[];
}
