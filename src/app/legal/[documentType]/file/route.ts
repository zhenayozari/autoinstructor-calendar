import { NextResponse } from "next/server";
import { getPublishedLegalDocumentBySlug } from "@/lib/legal-documents";
import { readLocalLegalDocument } from "@/lib/uploads/legal-documents";

export const dynamic = "force-dynamic";

type LegalDocumentFileRouteContext = {
  params: Promise<{
    documentType: string;
  }>;
};

function getContentDisposition(fileName: string, inline: boolean) {
  const disposition = inline ? "inline" : "attachment";

  return `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _request: Request,
  { params }: LegalDocumentFileRouteContext,
) {
  const { documentType } = await params;
  const document = await getPublishedLegalDocumentBySlug(documentType);

  if (!document) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const file = await readLocalLegalDocument(document.storage_path);
    const isPdf = document.mime_type === "application/pdf";

    return new NextResponse(file, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": getContentDisposition(
          document.original_file_name,
          isPdf,
        ),
        "Content-Length": String(file.byteLength),
        "Content-Type": document.mime_type,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("legal document file:", error);

    return new NextResponse("Not found", { status: 404 });
  }
}
