import { prisma } from "@/lib/prisma";
import { getClientDocumentUrl } from "@/lib/client-document-storage";

export type RegistrationRequestDocument = {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function getPendingRegistrationRequests() {
  const requests = await prisma.clientRegistrationRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { criadoEm: "asc" },
  });

  return Promise.all(
    requests.map(async (request) => {
      const documentos = (request.documentos as unknown as RegistrationRequestDocument[]) ?? [];
      const documentosComLink = await Promise.all(
        documentos.map(async (doc) => {
          try {
            const url = await getClientDocumentUrl(doc.key);
            return { ...doc, url };
          } catch {
            return { ...doc, url: null as string | null };
          }
        })
      );
      return { ...request, documentos: documentosComLink };
    })
  );
}
