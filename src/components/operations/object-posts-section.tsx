"use client";

import { useState } from "react";
import { Edit2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import type { ObjectPost } from "../../lib/operations/object-posts-repository";
import {
  createObjectPostAction,
  deleteObjectPostAction,
  updateObjectPostAction,
} from "../../app/objects/actions";

type ObjectPostsSectionProps = {
  objectId: string;
  posts: ObjectPost[];
};

export function ObjectPostsSection({ objectId, posts }: ObjectPostsSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="rounded-card border border-app-border bg-app-surface p-4 shadow-glow sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Посты</h2>
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
          Добавить
        </Button>
      </div>

      <div className="space-y-3">
        {isAdding && (
          <form
            action={async (fd) => {
              await createObjectPostAction(fd);
              setIsAdding(false);
            }}
            className="flex items-center gap-2 rounded-button border border-app-border bg-app-bg p-2"
          >
            <input type="hidden" name="objectId" value={objectId} />
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setIsAdding(false)}
            >
              <X className="size-4" />
            </Button>
          </form>
        )}

        {posts.length === 0 && !isAdding ? (
          <p className="text-sm text-app-muted">Нет добавленных постов.</p>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="flex items-center justify-between rounded-button border border-app-border bg-app-bg p-2"
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
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="px-2 text-sm">{post.name}</span>
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
                </>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
