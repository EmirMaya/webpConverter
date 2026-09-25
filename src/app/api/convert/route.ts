import { getAdmission } from "@/server/admission";
import { identifyClient } from "@/server/client-identity";
import { createConvertHandler } from "@/server/convert-handler";
import { convertInWorker } from "@/server/convert-worker";
import { readUpload } from "@/server/read-upload";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = createConvertHandler({
  admission: getAdmission,
  identify: identifyClient,
  read: readUpload,
  convert: convertInWorker,
  report: (event) => console.info(JSON.stringify(event)),
});
