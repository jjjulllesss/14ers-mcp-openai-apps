#!/usr/bin/env node

/**
 * Upload widget assets to Supabase Storage
 * 
 * This script uploads the built widget files (.js, .css) to Supabase Storage.
 * Make sure you have the Supabase CLI installed and configured, or use the Supabase dashboard.
 * 
 * Usage:
 *   node upload-to-supabase.mjs
 * 
 * Or set environment variables:
 *   SUPABASE_URL=https://kxvaohpqmhdtptwnaoyb.supabase.co
 *   SUPABASE_ACCESS_TOKEN=your_access_token
 *   node upload-to-supabase.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple .env file reader
function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    const lines = envContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = value;
          }
        }
      }
    }
  }
}

// Load .env file if it exists
loadEnvFile();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kxvaohpqmhdtptwnaoyb.supabase.co";
const STORAGE_BUCKET = "widgets";
const ASSETS_DIR = path.join(__dirname, "assets");

// Get all .js and .css files from assets directory
function getAssetFiles() {
  const files = fs.readdirSync(ASSETS_DIR);
  return files
    .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
    .map((f) => ({
      localPath: path.join(ASSETS_DIR, f),
      fileName: f,
      contentType: f.endsWith(".js") ? "application/javascript" : "text/css",
    }));
}

async function uploadFile(file, accessToken) {
  const fileContent = fs.readFileSync(file.localPath);
  // Use the correct Supabase Storage API endpoint
  const url = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${file.fileName}`;

  console.log(`Uploading ${file.fileName}...`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": file.contentType,
        "x-upsert": "true", // Allow overwriting existing files
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour (3600 seconds)
      },
      body: fileContent,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Failed to upload ${file.fileName}: ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage += ` - ${errorJson.message}`;
        }
        if (errorJson.error) {
          errorMessage += ` (${errorJson.error})`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    console.log(`✓ Successfully uploaded ${file.fileName}`);
    return true;
  } catch (error) {
    console.error(`✗ Error uploading ${file.fileName}:`, error.message);
    return false;
  }
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!accessToken) {
    console.error(`
Error: SUPABASE_ACCESS_TOKEN environment variable is required.

To get your access token:
1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to Settings > API
4. Copy your "service_role" key (for uploads - bypasses RLS)
   ⚠️  Keep this key secret! Never commit it to git.

   Note: For uploads, you need the "service_role" key (not "anon" key)
   because it bypasses Row Level Security policies.

Then you have three options:

Option 1: Add to .env file (recommended)
  Add this line to your .env file:
  SUPABASE_ACCESS_TOKEN=your_service_role_key_here

Option 2: Set as environment variable for this command
  SUPABASE_ACCESS_TOKEN=your_service_role_key pnpm run upload:supabase

Option 3: Export in your shell
  export SUPABASE_ACCESS_TOKEN=your_service_role_key
  pnpm run upload:supabase
`);
    process.exit(1);
  }

  const files = getAssetFiles();

  if (files.length === 0) {
    console.error("No .js or .css files found in assets directory. Run 'pnpm run build' first.");
    process.exit(1);
  }

  console.log(`Found ${files.length} files to upload to ${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/`);
  console.log("");
  console.log("⚠️  Make sure your 'widgets' bucket exists and is set to Public in Supabase Storage.");
  console.log("");

  let successCount = 0;
  for (const file of files) {
    const success = await uploadFile(file, accessToken);
    if (success) successCount++;
  }

  console.log("");
  console.log(`Upload complete: ${successCount}/${files.length} files uploaded successfully`);

  if (successCount === files.length) {
    console.log("");
    console.log("✓ All files uploaded! Your widgets are now available at:");
    files.forEach((file) => {
      console.log(`  ${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${file.fileName}`);
    });
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

