import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getUploadsDir } from "@/lib/uploads/local-storage";

export const dynamic = "force-dynamic";

type UploadsRouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function resolveUploadPath(parts: string[]) {
  const uploadsDir = path.resolve(getUploadsDir());
  const requestedPath = path.resolve(uploadsDir, ...parts);
  const relativePath = path.relative(uploadsDir, requestedPath);

  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return requestedPath;
}

export async function GET(_request: Request, { params }: UploadsRouteContext) {
  const { path: pathParts } = await params;
  const filePath = resolveUploadPath(pathParts);

  if (!filePath) {
    return new NextResponse("Not found", { status: 404 });
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension];

  if (!contentType) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const [file, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);

    if (!fileStat.isFile()) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(file, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(file.byteLength),
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("local upload file:", error);

    return new NextResponse("Not found", { status: 404 });
  }
}
