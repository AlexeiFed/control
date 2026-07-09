# Schedule Posts and Monthly Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement monthly operational day settings and multiple posts per object to allow flexible schedule management.

**Architecture:** We will create two new tables: `object_monthly_settings` for storing month-specific operational day start times, and `object_posts` for managing posts within an object. We'll update the `shifts` and `object_shift_templates` tables to reference the new `post_id`. The UI will be updated to support these new entities, grouping schedule grids and timesheets by post.

**Tech Stack:** PostgreSQL (schema.sql), TypeScript, Next.js, React

---

### Task 1: Database Schema Updates

**Files:**
- Modify: `src/db/schema.sql`
- Create: `src/db/migrations/20260706_posts_and_monthly_settings.sql`

- [ ] **Step 1: Write the migration script**

```sql
-- src/db/migrations/20260706_posts_and_monthly_settings.sql
CREATE TABLE IF NOT EXISTS object_monthly_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  month text NOT NULL, -- Format: YYYY-MM
  operational_day_start_time time NOT NULL DEFAULT '08:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, month)
);

CREATE TABLE IF NOT EXISTS object_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, name)
);

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS post_id uuid NULL REFERENCES object_posts(id) ON DELETE SET NULL;
ALTER TABLE object_shift_templates ADD COLUMN IF NOT EXISTS post_id uuid NULL REFERENCES object_posts(id) ON DELETE SET NULL;

ALTER TABLE timesheet_shift_entries ADD COLUMN IF NOT EXISTS post_id uuid NULL;
ALTER TABLE timesheet_shift_entries ADD COLUMN IF NOT EXISTS post_name text NULL;
```

- [ ] **Step 2: Update schema.sql to include new tables and columns**

```sql
-- Add to src/db/schema.sql after security_objects definition
CREATE TABLE IF NOT EXISTS object_monthly_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  month text NOT NULL,
  operational_day_start_time time NOT NULL DEFAULT '08:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, month)
);

CREATE TABLE IF NOT EXISTS object_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, name)
);

-- Add to shifts table definition
  post_id uuid NULL REFERENCES object_posts(id) ON DELETE SET NULL,

-- Add to object_shift_templates table definition
  post_id uuid NULL REFERENCES object_posts(id) ON DELETE SET NULL,

-- Add to timesheet_shift_entries table definition
  post_id uuid NULL,
  post_name text NULL,
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.sql src/db/migrations/20260706_posts_and_monthly_settings.sql
git commit -m "db: add object_monthly_settings and object_posts tables"
```

### Task 2: Repositories for New Entities

**Files:**
- Create: `src/lib/operations/object-monthly-settings-repository.ts`
- Create: `src/lib/operations/object-posts-repository.ts`

- [ ] **Step 1: Create object-monthly-settings-repository.ts**

```typescript
// src/lib/operations/object-monthly-settings-repository.ts
import { query } from '@/db/db';

export interface ObjectMonthlySetting {
  id: string;
  objectId: string;
  month: string;
  operationalDayStartTime: string;
}

export async function getObjectMonthlySetting(objectId: string, month: string): Promise<ObjectMonthlySetting | null> {
  const rows = await query<{
    id: string;
    object_id: string;
    month: string;
    operational_day_start_time: string;
  }>(
    `SELECT id, object_id, month, operational_day_start_time::text AS operational_day_start_time
     FROM object_monthly_settings
     WHERE object_id = $1 AND month = $2`,
    [objectId, month]
  );

  if (rows.length === 0) return null;

  return {
    id: rows[0].id,
    objectId: rows[0].object_id,
    month: rows[0].month,
    operationalDayStartTime: rows[0].operational_day_start_time,
  };
}

export async function upsertObjectMonthlySetting(objectId: string, month: string, startTime: string): Promise<void> {
  await query(
    `INSERT INTO object_monthly_settings (object_id, month, operational_day_start_time)
     VALUES ($1, $2, $3)
     ON CONFLICT (object_id, month) DO UPDATE
     SET operational_day_start_time = EXCLUDED.operational_day_start_time`,
    [objectId, month, startTime]
  );
}
```

- [ ] **Step 2: Create object-posts-repository.ts**

```typescript
// src/lib/operations/object-posts-repository.ts
import { query } from '@/db/db';

export interface ObjectPost {
  id: string;
  objectId: string;
  name: string;
}

export async function getObjectPosts(objectId: string): Promise<ObjectPost[]> {
  const rows = await query<{ id: string; object_id: string; name: string }>(
    `SELECT id, object_id, name
     FROM object_posts
     WHERE object_id = $1
     ORDER BY created_at ASC`,
    [objectId]
  );

  return rows.map(row => ({
    id: row.id,
    objectId: row.object_id,
    name: row.name,
  }));
}

export async function createObjectPost(objectId: string, name: string): Promise<ObjectPost> {
  const rows = await query<{ id: string }>(
    `INSERT INTO object_posts (object_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [objectId, name]
  );

  return {
    id: rows[0].id,
    objectId,
    name,
  };
}

export async function updateObjectPost(id: string, name: string): Promise<void> {
  await query(
    `UPDATE object_posts SET name = $1 WHERE id = $2`,
    [name, id]
  );
}

export async function deleteObjectPost(id: string): Promise<void> {
  await query(`DELETE FROM object_posts WHERE id = $1`, [id]);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/operations/object-monthly-settings-repository.ts src/lib/operations/object-posts-repository.ts
git commit -m "feat: add repositories for monthly settings and posts"
```

### Task 3: Update Existing Repositories

**Files:**
- Modify: `src/lib/operations/objects-repository.ts`
- Modify: `src/lib/operations/scheduler-repository.ts`

- [ ] **Step 1: Update objects-repository.ts to fetch operational day start time with fallback**

```typescript
// Add function to src/lib/operations/objects-repository.ts
import { getObjectMonthlySetting } from './object-monthly-settings-repository';

export async function getObjectOperationalDayStartTimeForMonth(objectId: string, month: string): Promise<string> {
  const setting = await getObjectMonthlySetting(objectId, month);
  if (setting) {
    return normalizeOperationalAnchorTime(setting.operationalDayStartTime);
  }

  // Fallback to the object's default
  const rows = await query<{ operational_day_start_time: string }>(
    `SELECT operational_day_start_time::text AS operational_day_start_time
     FROM security_objects WHERE id = $1`,
    [objectId]
  );

  return normalizeOperationalAnchorTime(rows[0]?.operational_day_start_time || '08:00:00');
}
```

- [ ] **Step 2: Update scheduler-repository.ts to include post_id**

```typescript
// In src/lib/operations/scheduler-repository.ts
// Update Shift interface to include postId
export interface Shift {
  // ... existing fields
  postId: string | null;
}

// Update getShiftsForObject to select post_id
// `SELECT id, guard_id, object_id, starts_at, ends_at, total_minutes, shift_kind, post_id ...`

// Update map row to Shift object
// postId: row.post_id,

// Update createShift to insert post_id
// `INSERT INTO shifts (guard_id, object_id, starts_at, ends_at, shift_kind, post_id) VALUES ($1, $2, $3, $4, $5, $6)`
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/operations/objects-repository.ts src/lib/operations/scheduler-repository.ts
git commit -m "feat: update repositories to support monthly settings and posts"
```

### Task 4: UI for Monthly Settings

**Files:**
- Modify: `src/app/(erp)/objects/[id]/schedule/page.tsx` (or equivalent schedule page component)

- [ ] **Step 1: Add Month Selector and Operational Day Setting to Schedule Page**

```tsx
// In the schedule page component, add state for current month and operational day start
// Fetch the operational day start time for the selected month using the new repository function
// Add a UI control (e.g., a time input) to allow changing the operational day start time for the current month
// On change, call a server action that uses upsertObjectMonthlySetting
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(erp)/objects/[id]/schedule/page.tsx
git commit -m "feat: add monthly operational day setting to schedule page"
```

### Task 5: UI for Object Posts

**Files:**
- Modify: `src/app/(erp)/objects/[id]/settings/page.tsx` (or equivalent settings page)

- [ ] **Step 1: Add Posts Management Section**

```tsx
// In the object settings page, fetch posts using getObjectPosts
// Render a list of posts
// Add a form to create a new post (calls server action using createObjectPost)
// Add edit/delete buttons for each post (calls server actions using updateObjectPost/deleteObjectPost)
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(erp)/objects/[id]/settings/page.tsx
git commit -m "feat: add posts management to object settings"
```

### Task 6: Update Schedule Grid UI

**Files:**
- Modify: `src/components/operations/schedule-grid.tsx` (or equivalent component)

- [ ] **Step 1: Group shifts by post in the grid**

```tsx
// Fetch posts for the object
// If posts.length > 0, render a separate grid section for each post
// Filter shifts by post_id to display them in the correct section
// Shifts with post_id = null can be displayed in a "Default" or "Unassigned" section
// When creating a new shift by clicking on the grid, pass the corresponding post_id
```

- [ ] **Step 2: Commit**

```bash
git add src/components/operations/schedule-grid.tsx
git commit -m "feat: group schedule grid by posts"
```

### Task 7: Update Timesheet UI and Export

**Files:**
- Modify: `src/app/(erp)/objects/[id]/timesheet/page.tsx` (or equivalent timesheet page)
- Modify: `src/lib/accounting/timesheet-object-xlsx.ts`

- [ ] **Step 1: Group timesheet rows by post**

```tsx
// Fetch posts for the object
// Group timesheet entries by post_id
// Render a section header for each post
// Render the timesheet rows for that post under the header
```

- [ ] **Step 2: Update XLSX export**

```typescript
// In src/lib/accounting/timesheet-object-xlsx.ts
// Group entries by post_id before generating the worksheet
// Add rows for post headers to separate the data visually
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(erp)/objects/[id]/timesheet/page.tsx src/lib/accounting/timesheet-object-xlsx.ts
git commit -m "feat: group timesheet UI and export by posts"
```
