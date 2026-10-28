/**
 * Browser-side prompt attachments.
 *
 * Files are read into `data:` URLs and sent as opencode `file` parts. opencode
 * only decodes `text/plain` data URLs into the conversation, so every text-like
 * file is normalized to that mime; images and PDFs keep their real mime so the
 * model receives them as media. Anything else cannot be represented inline and
 * is rejected rather than silently dropped by the server.
 */

export interface Attachment {
	id: string;
	name: string;
	/** Normalized mime sent to opencode. */
	mime: string;
	/** Original (decoded) byte size. */
	size: number;
	/** `data:<mime>;base64,…` */
	dataUrl: string;
}

/** opencode rejects decoded attachments over 20 MiB; mirror it here. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** Keep the whole message under opencode's per-prompt attachment budget. */
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const TEXT_APPLICATION_MIMES = new Set([
	"application/json",
	"application/xml",
	"application/javascript",
	"application/typescript",
	"application/x-yaml",
	"application/yaml",
	"application/x-sh",
	"application/sql",
	"application/graphql",
	"application/x-httpd-php",
]);

function isTextMime(mime: string): boolean {
	return mime.startsWith("text/") || TEXT_APPLICATION_MIMES.has(mime);
}

function decodesAsUtf8(bytes: Uint8Array<ArrayBuffer>): boolean {
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		return true;
	} catch {
		return false;
	}
}

function normalizeMime(file: File, bytes: Uint8Array<ArrayBuffer>): string | null {
	const type = file.type.toLowerCase();
	if (IMAGE_MIMES.has(type)) return type;
	if (type === "application/pdf") return type;
	// opencode treats SVG as text; sending it as image/svg+xml makes providers reject it.
	if (type === "image/svg+xml") return "text/plain";
	if (isTextMime(type)) return "text/plain";
	// Unknown or generic types: keep files that are actually UTF-8 text (e.g. a
	// `.md`/`.ts` file the OS reported as application/octet-stream).
	if (decodesAsUtf8(bytes)) return "text/plain";
	return null;
}

function readDataUrl(bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
		reader.readAsDataURL(new Blob([bytes], { type: mime }));
	});
}

/** `crypto.randomUUID` is only exposed in secure contexts. */
function newId(): string {
	return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1);
	return `${rounded} ${units[unit]}`;
}

export function isImageAttachment(attachment: Attachment): boolean {
	return attachment.mime.startsWith("image/");
}

/**
 * Read and normalize `files`. Files that cannot be attached are skipped and
 * reported in `errors`; `existingBytes` is the size already in the composer so
 * the total stays under the message budget.
 */
export async function prepareAttachments(
	files: File[],
	existingBytes = 0,
): Promise<{ attachments: Attachment[]; errors: string[] }> {
	const attachments: Attachment[] = [];
	const errors: string[] = [];
	let total = existingBytes;

	for (const file of files) {
		if (file.size > MAX_ATTACHMENT_BYTES) {
			errors.push(`${file.name || "File"} is larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
			continue;
		}
		if (total + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
			errors.push(`Attachments exceed the ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)} total limit.`);
			continue;
		}
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const mime = normalizeMime(file, bytes);
			if (!mime) {
				errors.push(`${file.name || "File"} is not an image, text file, or PDF.`);
				continue;
			}
			const dataUrl = await readDataUrl(bytes, mime);
			attachments.push({
				id: newId(),
				name: file.name || "attachment",
				mime,
				size: file.size,
				dataUrl,
			});
			total += file.size;
		} catch {
			errors.push(`Could not read ${file.name || "file"}.`);
		}
	}

	return { attachments, errors };
}
