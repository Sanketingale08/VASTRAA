import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

const accountId = process.env.R2_ACCOUNT_ID || "8c6b7cd3536446e75a3a9f4109b14931";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const bucket = process.env.R2_BUCKET_NAME || "vastraa";

if (!accessKeyId || !secretAccessKey) {
  console.error("Missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

function getMime(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function getFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

async function sync() {
  const baseDir = path.resolve(process.cwd(), "artifacts/api-server/public/uploads");
  const files = getFiles(baseDir);
  console.log(`Found ${files.length} images to sync to Cloudflare R2 bucket "${bucket}"...`);

  let successCount = 0;
  let failCount = 0;

  for (const filePath of files) {
    const relativeKey = path.relative(baseDir, filePath).replace(/\\/g, "/");
    const data = fs.readFileSync(filePath);
    const mime = getMime(filePath);

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: relativeKey,
          Body: data,
          ContentType: mime,
        })
      );
      successCount++;
      console.log(`[✓] Uploaded: ${relativeKey} (${mime})`);
    } catch (err: any) {
      failCount++;
      console.error(`[✗] Failed ${relativeKey}: ${err.name} - ${err.message}`);
      if (err.name === "AccessDenied") {
        console.error("\nAborting: Cloudflare R2 API token has Access Denied. Please ensure token permissions are set to 'Admin Read & Write' or 'Object Read & Write' in Cloudflare dashboard.");
        break;
      }
    }
  }

  console.log(`\nSync finished. Success: ${successCount}, Failed: ${failCount}`);
}

sync();

