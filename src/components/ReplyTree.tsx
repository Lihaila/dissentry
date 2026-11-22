import type { Post, Profile } from '../lib/types';
import { PostCard } from './PostCard';

export function buildByParent(posts: Post[]): Map<string, Post[]> {
  const byParent = new Map<string, Post[]>();
  for (const p of posts) {
    if (!p.parentId) continue;
    const list = byParent.get(p.parentId);
    if (list) list.push(p);
    else byParent.set(p.parentId, [p]);
  }
  return byParent;
}

export function ReplyBranch({
  post,
  parent,
  byParent,
  profiles,
  handleOf,
  onReplied,
  connectSiblings = false,
  hasNextSibling = false,
  depth = 0,
  visualDepth = 0,
}: {
  post: Post;
  parent: Post | null;
  byParent: Map<string, Post[]>;
  profiles: Map<string, Profile>;
  handleOf: (p: Post) => string | undefined;
  onReplied: (replyId: string) => void;
  /** Connect sibling model answers of a user question with a vertical thread line. */
  connectSiblings?: boolean;
  hasNextSibling?: boolean;
  depth?: number;
  visualDepth?: number;
}) {
  const children = depth < 50 ? (byParent.get(post.id) ?? []) : [];
  // A user question + its direct model answer(s) form one cohesive Q&A block connected by X's vertical line.
  // Follow-up replies to a model answer (or a user replying directly to another user post) nest underneath with a left rail.
  const directModelAnswers = post.kind === 'user' ? children.filter((c) => c.kind === 'model') : [];
  const nestedReplies = post.kind === 'user' ? children.filter((c) => c.kind !== 'model') : children;

  const lineBelow = directModelAnswers.length > 0 || (connectSiblings && hasNextSibling && nestedReplies.length === 0);
  const replyingTo = parent && (parent.kind === 'model' || (depth > 0 && post.kind === 'user')) ? handleOf(parent) : undefined;
  const indentChildren = visualDepth < 3;

  return (
    <div id={`post-${post.id}`} className="scroll-mt-28 md:scroll-mt-16">
      <PostCard
        post={post}
        profiles={profiles}
        lineBelow={lineBelow}
        replyingTo={replyingTo}
        onReplied={onReplied}
      />

      {directModelAnswers.map((ans, i) => {
        const prev = i > 0 ? directModelAnswers[i - 1] : null;
        const prevHadNested = prev ? (byParent.get(prev.id)?.length ?? 0) > 0 : false;
        return (
          <div key={ans.id} className={prevHadNested ? 'border-t border-slate-100' : ''}>
            <ReplyBranch
              post={ans}
              parent={post}
              byParent={byParent}
              profiles={profiles}
              handleOf={handleOf}
              onReplied={onReplied}
              connectSiblings
              hasNextSibling={i < directModelAnswers.length - 1}
              depth={depth + 1}
              visualDepth={visualDepth}
            />
          </div>
        );
      })}

      {nestedReplies.length > 0 && (
        <div
          className={
            indentChildren
              ? 'ml-4 border-l-2 border-slate-200/80 pl-1.5 sm:ml-6 sm:pl-2.5'
              : 'border-t border-slate-100'
          }
        >
          {nestedReplies.map((child, i) => (
            <div key={child.id} className={i > 0 ? 'border-t border-slate-100' : ''}>
              <ReplyBranch
                post={child}
                parent={post}
                byParent={byParent}
                profiles={profiles}
                handleOf={handleOf}
                onReplied={onReplied}
                depth={depth + 1}
                visualDepth={visualDepth + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
