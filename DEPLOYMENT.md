# Deployment Guide: Supabase Storage

This guide walks you through deploying your widget assets to Supabase Storage.

## Prerequisites

1. A Supabase project with Storage enabled
2. A public storage bucket named `widgets`
3. Your Supabase access token (anon key for public bucket)

## Step-by-Step Deployment

### 1. Create the Storage Bucket (if not already created)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Name it `widgets`
5. Set it to **Public** (important!)
6. Click **Create bucket**

### 2. Get Your Access Token

1. In your Supabase dashboard, go to **Settings** > **API**
2. Copy your **anon** key (this is safe for public buckets)
   - For production, you can use the `anon` key since the bucket is public
   - The `service_role` key has admin access and should be kept secret

### 3. Build the Widgets with Supabase URL

Build the widgets with the correct BASE_URL:

```bash
pnpm run build:supabase
```

This will:
- Build all widgets (mountains, mountain-info)
- Generate hashed filenames (e.g., `mountains-9252.js`)
- Create HTML files that reference the Supabase storage URLs

### 4. Upload Assets to Supabase Storage

Upload the built `.js` and `.css` files to your Supabase storage:

```bash
SUPABASE_ACCESS_TOKEN=your_anon_key_here pnpm run upload:supabase
```

Or use the combined deploy command:

```bash
SUPABASE_ACCESS_TOKEN=your_anon_key_here pnpm run deploy:supabase
```

This will:
- Upload all `.js` and `.css` files to the `widgets` bucket
- Show you the public URLs for each file

### 5. Verify Upload

After uploading, verify the files are accessible:

- `https://kxvaohpqmhdtptwnaoyb.supabase.co/storage/v1/object/public/widgets/mountains-9252.js`
- `https://kxvaohpqmhdtptwnaoyb.supabase.co/storage/v1/object/public/widgets/mountains-9252.css`
- `https://kxvaohpqmhdtptwnaoyb.supabase.co/storage/v1/object/public/widgets/mountain-info-9252.js`
- `https://kxvaohpqmhdtptwnaoyb.supabase.co/storage/v1/object/public/widgets/mountain-info-9252.css`

You should be able to open these URLs in your browser and see the file contents.

### 6. Update Your MCP Server

Your MCP server (`server.py`) will automatically use the HTML files from the `assets/` directory, which now reference the Supabase storage URLs. No changes needed to the server code!

## Troubleshooting

### Files not accessible after upload

- **Check bucket is public**: Go to Storage > widgets > Settings and ensure "Public bucket" is enabled
- **Check file permissions**: In the Storage dashboard, verify the files are listed and accessible
- **Check CORS**: Supabase Storage should handle CORS automatically for public buckets

### Upload fails with 401/403 error

- **Verify token**: Make sure you're using the correct `anon` key
- **Check bucket exists**: Ensure the `widgets` bucket exists and is public
- **Check token permissions**: The anon key should work for public buckets

### URLs in HTML are incorrect

- **Rebuild**: Run `pnpm run build:supabase` again to regenerate HTML files
- **Check BASE_URL**: Ensure the BASE_URL environment variable is set correctly

## Updating Widgets

When you make changes to your widgets:

1. Rebuild: `pnpm run build:supabase`
2. Re-upload: `SUPABASE_ACCESS_TOKEN=your_key pnpm run upload:supabase`

The hash in the filename will change if the version in `package.json` changes, ensuring proper cache busting.

## Alternative: Manual Upload via Dashboard

If you prefer to upload manually:

1. Build the widgets: `pnpm run build:supabase`
2. Go to Storage > widgets in your Supabase dashboard
3. Click **Upload file** and select the `.js` and `.css` files from the `assets/` directory
4. Upload all files with names like `*-9252.js` and `*-9252.css`

