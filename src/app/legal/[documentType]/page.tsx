import Link from "next/link";
import { Download, ExternalLink, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public/public-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPublishedLegalDocumentBySlug } from "@/lib/legal-documents";
import { getLegalDocumentDefinitionBySlug } from "@/lib/legal-document-definitions";

export const dynamic = "force-dynamic";

type LegalDocumentPageProps = {
  params: Promise<{
    documentType: string;
  }>;
};

function formatFileSize(value: string) {
  const size = Number(value);

  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }

  if (size < 1024 * 1024) {
    return `${Math.ceil(size / 1024)} КБ`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export default async function LegalDocumentPage({
  params,
}: LegalDocumentPageProps) {
  const { documentType } = await params;
  const definition = getLegalDocumentDefinitionBySlug(documentType);
  const document = await getPublishedLegalDocumentBySlug(documentType);

  if (!definition || !document) {
    notFound();
  }

  const filePath = `/legal/${definition.slug}/file`;
  const isPdf = document.mime_type === "application/pdf";
  const fileSize = formatFileSize(document.file_size_bytes);
  const publishedAt = formatDate(document.published_at);

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-4 text-zinc-950 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <PublicHeader />

        <section className="rounded-[2rem] border bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                <FileText className="size-3.5" />
                {definition.label}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {document.title}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-zinc-500">
                {document.version_label && (
                  <Badge variant="outline">{document.version_label}</Badge>
                )}
                {publishedAt && <span>Опубликовано: {publishedAt}</span>}
                {fileSize && <span>{fileSize}</span>}
              </div>
            </div>
            <Button
              nativeButton={false}
              render={<Link href={filePath} target="_blank" />}
              className="h-10"
            >
              {isPdf ? <ExternalLink /> : <Download />}
              {isPdf ? "Открыть PDF" : "Скачать документ"}
            </Button>
          </div>
        </section>

        {isPdf ? (
          <section className="mt-4 overflow-hidden rounded-[2rem] border bg-white shadow-sm">
            <iframe
              src={filePath}
              title={document.title}
              className="h-[72vh] w-full"
            />
          </section>
        ) : (
          <section className="mt-4 rounded-[2rem] border bg-white p-5 text-sm leading-6 text-zinc-600 shadow-sm sm:p-7">
            Документ опубликован и доступен для скачивания по кнопке выше.
          </section>
        )}
      </div>
    </main>
  );
}
