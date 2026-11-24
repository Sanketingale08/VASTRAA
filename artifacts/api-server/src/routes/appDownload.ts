import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";

const router = Router();

// Locate the compiled APK file across potential workspace and distribution directories
function getApkFilePath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "artifacts/vastraa/public/vastraa-app.apk"),
    path.resolve(process.cwd(), "artifacts/vastraa/public/ecommerce-store.apk"),
    path.resolve(process.cwd(), "ecommerce-store-debug.apk"),
    path.resolve(process.cwd(), "../../artifacts/vastraa/public/vastraa-app.apk"),
    path.resolve(process.cwd(), "../vastraa/public/vastraa-app.apk"),
    path.resolve("C:/Android_Workspace/android/app/build/outputs/apk/debug/app-debug.apk"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Android APK Download Endpoint
 * Forces the browser / mobile download manager to treat the file as a native Android package
 * and save it directly to device storage rather than opening in an inline document previewer.
 */
function serveApkDownload(req: Request, res: Response) {
  const apkPath = getApkFilePath();
  if (!apkPath || !fs.existsSync(apkPath)) {
    return res.status(404).json({ error: "APK file not found on server." });
  }

  const stat = fs.statSync(apkPath);
  const filename = "vastraa-app.apk";

  // Crucial headers for Android Package Installer and mobile browsers:
  // 1. Content-Type: application/vnd.android.package-archive ensures Android recognizes it as an installer
  // 2. Content-Disposition: attachment triggers file download instead of inline document preview
  // 3. X-Content-Type-Options: nosniff prevents the browser from guessing previewable MIME types
  res.writeHead(200, {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": stat.size,
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Transfer-Encoding": "binary",
    "Accept-Ranges": "bytes",
  });

  const fileStream = fs.createReadStream(apkPath);
  fileStream.pipe(res);
}

// Support multiple intuitive download routes
router.get("/download-app", serveApkDownload);
router.get("/app-download", serveApkDownload);
router.get("/download/vastraa-app.apk", serveApkDownload);
router.get("/api/download/vastraa-app.apk", serveApkDownload);
router.get("/api/app-download", serveApkDownload);

export default router;

