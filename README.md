# TypeSQL: Zero-Runtime TypeScript to PostgreSQL Transpiler

TypeSQL is a tool that allows you to define your database schema, business logic (triggers), and security policies (RLS) using TypeScript, and compiles them into high-performance, native PostgreSQL SQL.

## Key Features

- **Provider-Agnostic Authentication**: Write security logic once, deploy to any auth provider (Supabase, Custom Session Variables, or Native Postgres Roles)
- **Type-Safe Schema Definition**: Define tables as TypeScript classes with automatic type mapping
- **LINQ-Style Queries**: Write database queries using familiar TypeScript syntax
- **Compile-Time Transpilation**: Zero runtime overhead - everything compiles to native PL/pgSQL

## How It Works

TypeSQL uses **compile-time introspection** to read your TypeScript code and generate equivalent SQL. It does not run "on top" of your database; it simply generates the migration files you need.

## Provider-Agnostic Authentication System

One of TypeSQL's most powerful features is its **provider-agnostic auth system**. Write your security logic once using the universal `sql.auth` namespace, and the compiler handles the translation to your chosen authentication infrastructure.

### The Universal `sql.auth` Namespace

TypeSQL provides three primary auth methods:

```typescript
// Get the current user's ID
sql.auth.userId()

// Access JWT claims/metadata
sql.auth.jwt<string>('role')
sql.auth.jwt<string>('org_id')

// Check if a session exists
sql.auth.isAuthenticated()
```

### Supported Auth Providers

Configure your target provider in `typesql.config.json`:

#### PostgREST/Supabase (Default)
```json
{
  "authProvider": "PostgREST"
}
```
Compiles `sql.auth.userId()` to: `(current_setting('request.jwt.claim.sub', true))::uuid`

#### Custom Session Variables
```json
{
  "authProvider": "Session",
  "sessionVariables": {
    "userId": "app.current_user_id",
    "userRole": "app.current_user_role"
  }
}
```
Compiles `sql.auth.userId()` to: `current_setting('app.current_user_id', true)`

#### Native Postgres Roles
```json
{
  "authProvider": "Native"
}
```
Compiles `sql.auth.userId()` to: `current_user`

### Example: Multi-Provider Security Policy

```typescript
@Security.Policy(Post)
static defineRules(policy: Security.Builder<Post>) {
  
  // Users can only view their own posts
  policy.allowSelect("Owner Read")
    .to(Role.Authenticated)
    .using(post => post.user_id === sql.auth.userId());

  // Admin users can view all posts (using JWT claims)
  policy.allowSelect("Admin Read All")
    .to(Role.Authenticated)
    .using(post => sql.auth.jwt<string>('role') === 'admin');
}
```

**This same code** compiles to different SQL depending on your `authProvider` configuration:

**PostgREST:**
```sql
USING (
  (user_id = (current_setting('request.jwt.claim.sub', true))::uuid)
)
```

**Session:**
```sql
USING (
  (user_id = current_setting('app.current_user_id', true))
)
```

**Native:**
```sql
USING (
  (user_id = current_user)
)
```

## Core Features

### 1. Schema Definition (`@Table`, `@Column`)

You define your database tables as TypeScript classes using decorators.

**TypeScript Input:**
```typescript
@Table({ name: 'users' })
export class User {
  @PrimaryKey({ default: () => sql.uuid() })
  id: string;

  @Column({ name: 'display_name' })
  displayName: string;
}
```

**SQL Output:**
```sql
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
```

### 2. Business Logic (`@Trigger`)

Instead of writing complex PL/pgSQL syntax, write standard TypeScript functions.

**TypeScript Input:**
```typescript
@Trigger({ on: Comment, when: Event.BeforeInsert })
static rateLimit(newComment: Comment) {
  const recentCount = sql.from(Comment)
    .where(c => c.userId === newComment.userId 
             && c.createdAt > sql.now().minus('1 minute'))
    .count();

  if (recentCount >= 3) {
    throw new Error("Slow down!");
  }
}
```

**SQL Output:**
```sql
CREATE FUNCTION public.commentguard_rateLimit() RETURNS trigger AS $function$
DECLARE
    recent_count integer;
BEGIN
    SELECT count(*) INTO recent_count FROM public.comments
    WHERE comments.user_id = NEW.user_id AND ...;
    
    IF (recent_count >= 3) THEN
        RAISE EXCEPTION 'Slow down!';
    END IF;
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;
```

### 3. Security (`@Security.Policy`)

Row Level Security (RLS) is defined using a fluent, type-safe API.

**TypeScript Input:**
```typescript
@Security.Policy(SupportTicket)
static defineRules(policy: Security.Builder<SupportTicket>) {
  policy.allowSelect("Owner Read")
    .to(Role.Authenticated)
    .using(t => t.creatorId === sql.auth.userId());
}
```

**SQL Output (PostgREST):**
```sql
CREATE POLICY owner_read ON public.support_tickets
FOR SELECT TO authenticated
USING ( (creator_id = (current_setting('request.jwt.claim.sub', true))::uuid) );
```

## Running the Compiler

### Basic Usage

```bash
npm start compile examples/**/*.ts
```

### With Custom Auth Provider

```bash
# Using config file (typesql.config.json)
npm start compile examples/**/*.ts

# Using CLI flag
npm start compile examples/**/*.ts --auth-provider=Session

# Custom output path
npm start compile examples/**/*.ts -o dist/migration.sql
```

### Configuration File

Create `typesql.config.json` in your project root:

```json
{
  "authProvider": "PostgREST",
  "sessionVariables": {
    "userId": "app.current_user_id",
    "userRole": "app.current_user_role"
  }
}
```

## Local Testing with Auth Mocks

TypeSQL provides testing utilities to mock authentication state:

```typescript
// In your test files
sql.auth._mockUser('user_123');
sql.auth._mockClaim('role', 'admin');

// Now sql.auth.userId() returns 'user_123'
// And sql.auth.jwt('role') returns 'admin'
```

## Why TypeSQL?

- **No More Syntax Errors**: Write database logic in TypeScript with full IDE support
- **Type Safety**: Catch errors at compile time, not runtime
- **Provider Independence**: Switch auth providers without rewriting security logic
- **Modern DX**: LINQ-style queries, arrow functions, and familiar control flow
- **Zero Runtime Cost**: Compiles to native PL/pgSQL - no middleware layer

## Next Steps

- Check out [COMPILER_INTERNALS.md](COMPILER_INTERNALS.md) for details on how the transpiler works
- See the [examples/](examples/) directory for more complex use cases
- Read about [provider-specific auth setup](#auth-provider-setup) below

## Auth Provider Setup

### PostgREST/Supabase Setup

PostgREST automatically provides JWT claims via `current_setting('request.jwt.claim.*')`. No additional setup needed.

### Session Variables Setup

For custom Node.js/Prisma/Drizzle apps, set session variables before executing queries:

```sql
-- Set current user
SELECT set_config('app.current_user_id', 'user_123', false);
SELECT set_config('app.current_user_role', 'admin', false);

-- Now your policies will work
SELECT * FROM posts; -- RLS will use app.current_user_id
```

### Native Roles Setup

For native Postgres roles, use `SET ROLE`:

```sql
-- Switch to a specific user role
SET ROLE user_123;

-- Now current_user returns 'user_123'
SELECT * FROM posts; -- RLS will use current_user
```

## Examples

### Complete Auth Example

```typescript
// tables.ts
@Table({ name: 'posts' })
export class Post {
  @PrimaryKey({ default: () => sql.uuid() })
  id: string;

  @Column()
  user_id: string;

  @Column()
  title: string;
}

// PostPolicies.ts
export class PostPolicies {
  @Security.Policy(Post)
  static defineRules(policy: Security.Builder<Post>) {
    
    // Owner access
    policy.allowSelect("Owner Read")
      .to(Role.Authenticated)
      .using(post => post.user_id === sql.auth.userId());

    // Admin access (JWT claim check)
    policy.allowSelect("Admin Override")
      .to(Role.Authenticated)
      .using(post => sql.auth.jwt<string>('role') === 'admin');

    // Require auth for inserts
    policy.allowInsert("Auth Required")
      .to(Role.Authenticated)
      .using(post => sql.auth.isAuthenticated());
  }
}
```

This compiles to provider-specific SQL based on your configuration!
