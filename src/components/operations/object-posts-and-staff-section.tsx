"use client";

import { useEffect, useState } from "react";
import { Edit2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import type { ObjectPost } from "../../lib/operations/object-posts-repository";
import type { MonthlyPostGuardsByPostId } from "../../lib/operations/object-monthly-post-guards-repository";
import {
  createObjectPostAction,
  deleteObjectPostAction,
  replaceMonthlyPostGuardsAction,
  updateObjectPostAction,
} from "../../app/objects/actions";
import { designTokens } from "../../lib/design-tokens";

type ObjectPostsAndStaffSectionProps = {
  objectId: string;
  monthKey: string;
  monthLabel: string;
  posts: ObjectPost[];
  objectGuardIds: string[];
  monthlyPostGuardsByPostId: MonthlyPostGuardsByPostId;
  guardNames: Record<string, string>;
  canManage: boolean;
};

export function ObjectPostsAndStaffSection({
  objectId,
  monthKey,
  monthLabel,
  posts,
  objectGuardIds,
  monthlyPostGuardsByPostId,
  guardNames,
  canManage,
}: ObjectPostsAndStaffSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(posts[0]?.id ?? null);
  const [pendingStaff, setPendingStaff] = useState(false);

  useEffect(() => {
    if (posts.length === 0) {
      setActivePostId(null);
      return;
    }
    if (!activePostId || !posts.some((p) => p.id === activePostId)) {
      setActivePostId(posts[0].id);
    }
  }, [posts, activePostId]);

  const activePost = posts.find((p) => p.id === activePostId) ?? null;
  const activeGuardIds = activePost ? (monthlyPostGuardsByPostId[activePost.id] ?? []) : [];

  async function toggleGuard(guardId: string, checked: boolean) {
    if (!canManage || !activePost || pendingStaff) return;
    const next = checked
      ? [...new Set([...activeGuardIds, guardId])]
      : activeGuardIds.filter((id) => id !== guardId);

    setPendingStaff(true);
    try {
      const fd = new FormData();
      fd.set("objectId", objectId);
      fd.set("postId", activePost.id);
      fd.set("month", monthKey);
      fd.set("guardIds", next.join(","));
      await replaceMonthlyPostGuardsAction(fd);
    } finally {
      setPendingStaff(false);
    }
  }

  return (
    <section
      className="rounded-card border border-app-border bg-app-surface p-4 shadow-glow sm:p-6"
      style={{ borderColor: designTokens.color.border }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Посты за {monthLabel}</h2>
          <p className="mt-1 text-xs text-app-muted">
            Посты и штат настраиваются отдельно для каждого месяца. Июнь не меняется, если вы правите июль.
          </p>
        </div>
        {canManage ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
            }}
            disabled={isAdding}
          >
            <Plus className="mr-2 size-4" />
            Добавить пост
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">Посты</p>

          {isAdding ? (
            <form
              action={async (fd) => {
                await createObjectPostAction(fd);
                setIsAdding(false);
              }}
              className="flex items-center gap-2 rounded-button border border-app-border bg-app-bg p-2"
            >
              <input type="hidden" name="objectId" value={objectId} />
              <input type="hidden" name="month" value={monthKey} />
              <input
                name="name"
                placeholder="Название поста"
                required
                autoFocus
                className="flex-1 bg-transparent px-2 py-1 text-sm outline-none"
              />
              <Button type="submit" size="sm" variant="primary">
                <Save className="size-4" />
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
                <X className="size-4" />
              </Button>
            </form>
          ) : null}

          {posts.length === 0 && !isAdding ? (
            <p className="rounded-button border border-dashed border-app-border p-4 text-sm text-app-muted">
              Для этого месяца посты не настроены — график без разделов, как раньше.
            </p>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className={`flex items-center justify-between rounded-button border p-2 transition ${
                  activePostId === post.id
                    ? "border-accent-primary bg-accent-primary/5"
                    : "border-app-border bg-app-bg"
                }`}
              >
                {editingId === post.id ? (
                  <form
                    action={async (fd) => {
                      await updateObjectPostAction(fd);
                      setEditingId(null);
                    }}
                    className="flex flex-1 items-center gap-2"
                  >
                    <input type="hidden" name="id" value={post.id} />
                    <input type="hidden" name="objectId" value={objectId} />
                    <input
                      name="name"
                      defaultValue={post.name}
                      required
                      autoFocus
                      className="flex-1 bg-transparent px-2 py-1 text-sm outline-none"
                    />
                    <Button type="submit" size="sm" variant="primary">
                      <Save className="size-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="size-4" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex-1 px-2 text-left text-sm font-medium"
                      onClick={() => setActivePostId(post.id)}
                    >
                      {post.name}
                    </button>
                    {canManage ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(post.id);
                            setIsAdding(false);
                          }}
                        >
                          <Edit2 className="size-4" />
                        </Button>
                        <form action={deleteObjectPostAction}>
                          <input type="hidden" name="id" value={post.id} />
                          <input type="hidden" name="objectId" value={objectId} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className="text-accent-danger hover:bg-accent-danger/10 hover:text-accent-danger"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
            Штат поста{activePost ? `: ${activePost.name}` : ""}
          </p>

          {!activePost ? (
            <p className="rounded-button border border-dashed border-app-border p-4 text-sm text-app-muted">
              Выберите пост слева или добавьте первый пост для этого месяца.
            </p>
          ) : objectGuardIds.length === 0 ? (
            <p className="rounded-button border border-dashed border-app-border p-4 text-sm text-app-muted">
              Сначала назначьте охранников на объект (блок выше).
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-auto rounded-button border border-app-border bg-app-bg p-2">
              {objectGuardIds.map((guardId) => {
                const checked = activeGuardIds.includes(guardId);
                return (
                  <label
                    key={guardId}
                    className="flex cursor-pointer items-center gap-3 rounded-button p-2 transition hover:bg-app-elevated"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canManage || pendingStaff}
                      onChange={(e) => void toggleGuard(guardId, e.target.checked)}
                      className="size-4 rounded border-app-border"
                    />
                    <span className="text-sm">{guardNames[guardId] ?? "Неизвестный"}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
