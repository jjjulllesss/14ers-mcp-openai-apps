# Quick Start: Upload to Supabase

## Step 1: Get Your Supabase Access Token

1. Go to https://supabase.com/dashboard
2. Select your project (or create one if needed)
3. Go to **Settings** → **API**
4. Copy your **service_role** key (⚠️ **Keep this secret!** Never commit it to git)
   - You need the `service_role` key (not `anon` key) for uploads
   - The `service_role` key bypasses Row Level Security, which is required for file uploads
   - The `anon` key is only for reading public files

## Step 2: Set the Token

You have three options:

### Option A: Add to .env file (Recommended)

Create or edit `.env` in the project root:

```bash
SUPABASE_ACCESS_TOKEN=your_service_role_key_here
```

Then run:
```bash
pnpm run deploy:supabase
```

### Option B: Set for one command

```bash
SUPABASE_ACCESS_TOKEN=your_service_role_key_here pnpm run deploy:supabase
```

### Option C: Export in your shell

```bash
export SUPABASE_ACCESS_TOKEN=your_service_role_key_here
pnpm run deploy:supabase
```

## Step 3: Ensure Storage Bucket Exists

1. In Supabase dashboard, go to **Storage**
2. Create a bucket named `widgets` if it doesn't exist
3. Make sure it's set to **Public** (so files can be read by anyone)
4. The bucket can have RLS enabled - that's fine, the `service_role` key bypasses it

## Troubleshooting

### Error: "new row violates row-level security policy"

This means you're using the `anon` key instead of the `service_role` key. 
- ❌ **Wrong**: Using `anon` key for uploads
- ✅ **Correct**: Use `service_role` key for uploads

The `anon` key is only for reading public files, not for uploading.

That's it! The deploy command will build and upload your widgets.
