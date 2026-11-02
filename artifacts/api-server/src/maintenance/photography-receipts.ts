import { pool } from "@workspace/db";
import {
  previewPhotographyReceiptCleanup, approvePhotographyReceiptCleanup, executePhotographyReceiptCleanup,
} from "../lib/photography-receipt-cleanup";

// Deliberately no default retention/approval, no scheduler and no bucket scan.
const [command, ...args] = process.argv.slice(2);
try {
  let result;
  if (command === "preview" && args.length === 1) {
    result = await previewPhotographyReceiptCleanup(Number(args[0]));
  } else if (command === "approve" && args.length === 4 && args[3] === "--confirm-reviewed-report") {
    result = await approvePhotographyReceiptCleanup(args[0], Number(args[1]), args[2]);
  } else if (command === "execute" && args.length === 2 && args[1] === "--confirm-delete") {
    result = await executePhotographyReceiptCleanup(args[0]);
  } else {
    throw new Error("Usage: preview <days> | approve <run-id> <same-days> <approver> --confirm-reviewed-report | execute <run-id> --confirm-delete");
  }
  console.log(JSON.stringify(result, null, 2));
} finally { await pool.end(); }
