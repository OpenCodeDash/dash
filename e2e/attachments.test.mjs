// Prompt attachments: picker/drop wiring, inline previews, and the exact file
// parts dash sends to opencode. Self-contained: creates a scratch session and
// cleans it up. No model required — the user message is persisted before the
// turn runs.
import { newPage, sleep, results } from "./cdp.mjs";
import { API_URL, APP_URL, Suite, authenticate, deleteSession, newScratchSession } from "./lib.mjs";

const dropFiles = (withImage) => `(async () => {
  const files = [];
  if (${withImage}) {
    const canvas = document.createElement("canvas");
    canvas.width = 8; canvas.height = 8;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e11"; ctx.fillRect(0, 0, 8, 8);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    files.push(new File([blob], "red-square.png", { type: "image/png" }));
  }
  files.push(new File(["hello from attachment"], "note.txt", { type: "text/plain" }));
  const data = new DataTransfer();
  for (const file of files) data.items.add(file);
  const target = document.querySelector("textarea");
  if (!target) return { ok: false };
  target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
  return { ok: true };
})()`;

const dropBinary = `(() => {
  const data = new DataTransfer();
  data.items.add(new File([new Uint8Array([0, 159, 146, 150, 0, 255])], "blob.bin", { type: "application/octet-stream" }));
  const target = document.querySelector("textarea");
  if (!target) return false;
  target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
  return true;
})()`;

const typeText = (text) => `(() => {
  const ta = document.querySelector("textarea");
  if (!ta) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setter.call(ta, ${JSON.stringify(text)});
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`;

const clickButton = (label) => `(() => {
  const button = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === ${JSON.stringify(label)});
  if (!button) return false;
  button.click();
  return true;
})()`;

async function userMessage(sessionId) {
	const res = await fetch(`${API_URL}/session/${sessionId}/message`);
	if (!res.ok) return null;
	const entries = await res.json();
	for (const entry of entries) {
		if (entry.info?.role !== "user") continue;
		const files = (entry.parts || []).filter((part) => part.type === "file");
		const texts = (entry.parts || []).filter((part) => part.type === "text" && !part.synthetic);
		if (files.length || texts.length) return { files, texts, parts: entry.parts || [] };
	}
	return null;
}

async function waitForUserMessage(sessionId, timeout = 10000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const message = await userMessage(sessionId);
		if (message) return message;
		await sleep(250);
	}
	return null;
}

export async function run() {
	const s = new Suite("attachments");
	const session = await newScratchSession("e2e attachments");
	const token = await authenticate();
	const c = await newPage("about:blank", { token });
	try {
		await c.send("Page.navigate", { url: `${APP_URL}/session/${session.id}` });
		await sleep(3500);

		results("picker + camera inputs");
		s.check(
			"attach picker accepts images/text/PDF",
			await c.eval(`(() => {
				const input = document.querySelector('input[type=file][multiple]');
				const accept = input ? input.getAttribute("accept") || "" : "";
				return accept.includes("image/") && accept.includes("text/") && accept.includes("application/pdf");
			})()`),
		);
		s.check(
			"mobile camera picker exists with capture=environment",
			await c.eval(`(() => {
				const input = document.querySelector('input[type=file][capture]');
				return !!input && input.getAttribute("capture") === "environment" && input.getAttribute("accept") === "image/*";
			})()`),
		);
		s.check(
			"camera button is present in the composer",
			await c.eval(`!![...document.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "") === "Take a photo")`),
		);

		results("drop previews + remove");
		await c.eval(dropBinary);
		await sleep(400);
		s.check(
			"unsupported binary is rejected with an error",
			await c.eval(`!![...document.querySelectorAll('[role="alert"]')].find((el) => el.textContent.includes("not an image, text file, or PDF"))`),
		);
		s.check("rejected binary adds no preview", !(await c.eval(`!!document.querySelector('[aria-label="Attachments"]')`)));

		await c.eval(dropFiles(true), { awaitPromise: true });
		await sleep(500);
		s.check("drop adds two attachment previews", (await c.eval(`document.querySelectorAll('[aria-label="Attachments"] > *').length`)) === 2);
		s.check("image attachment renders a thumbnail", await c.eval(`!!document.querySelector('[aria-label="Attachments"] img[alt="red-square.png"]')`));
		s.check("text attachment is listed", await c.eval(`!!document.querySelector('[aria-label="Attachments"] [title^="note.txt"]')`));

		await c.eval(`document.querySelector('[aria-label="Remove note.txt"]')?.click()`);
		await sleep(200);
		s.check("removing an attachment drops it from the preview", (await c.eval(`document.querySelectorAll('[aria-label="Attachments"] > *').length`)) === 1);

		await c.eval(dropFiles(false), { awaitPromise: true });
		await sleep(400);
		s.check("re-adding the text file restores two previews", (await c.eval(`document.querySelectorAll('[aria-label="Attachments"] > *').length`)) === 2);

		results("sent file parts + transcript");
		await c.eval(typeText("describe these attachments"));
		s.check("Send is enabled with attachments", await c.eval(clickButton("Send")));

		const message = await waitForUserMessage(session.id);
		s.check("user message with attachments reached opencode", !!message);
		const files = message?.files ?? [];
		const image = files.find((file) => file.filename === "red-square.png");
		const text = files.find((file) => file.filename === "note.txt");
		s.check("image sent as an inline image file part", !!image && image.mime.startsWith("image/") && image.url.startsWith("data:image/"));
		s.check("text sent as a text/plain file part", !!text && text.mime === "text/plain" && text.url.startsWith("data:text/plain;base64,"));
		s.check(
			"server decoded the text attachment for the model",
			(message?.parts ?? []).some((part) => part.type === "text" && part.synthetic && part.text.includes("hello from attachment")),
		);
		s.check("prompt text was sent", (message?.texts ?? []).some((part) => part.text.includes("describe these attachments")));

		// The transcript should show the image + chip, not the synthetic read-tool text.
		let rendered = false;
		for (let i = 0; i < 40; i++) {
			rendered = await c.eval(`[...document.querySelectorAll('img[alt="red-square.png"]')].some((img) => !img.closest('[aria-label="Attachments"]'))`);
			if (rendered) break;
			await sleep(250);
		}
		s.check("transcript renders the uploaded image", rendered);
		s.check(
			"transcript shows the text attachment chip",
			await c.eval(`[...document.querySelectorAll("a")].some((a) => (a.textContent || "").trim() === "note.txt")`),
		);
		s.check(
			"synthetic attachment text is not shown to the user",
			!(await c.eval(`document.body.innerText.includes("Called the Read tool with the following input")`)),
		);
	} finally {
		await fetch(`${API_URL}/session/${session.id}/abort`, { method: "POST" }).catch(() => {});
		await deleteSession(session.id);
		await c.close();
	}
	return s.summary();
}
