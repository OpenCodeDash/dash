import { useState } from "react";
import { Modal } from "../modal/modal.component.tsx";
import styles from "./prompt-dialog.module.scss";

interface PromptDialogProps {
	open: boolean;
	title: string;
	message?: string;
	placeholder?: string;
	initialValue?: string;
	submitLabel?: string;
	cancelLabel?: string;
	onSubmit: (value: string) => void;
	onClose: () => void;
}

export function PromptDialog({
	open,
	title,
	message,
	placeholder,
	initialValue = "",
	submitLabel = "Submit",
	cancelLabel = "Cancel",
	onSubmit,
	onClose,
}: PromptDialogProps) {
	const [value, setValue] = useState(initialValue);

	// Reset on close (rather than syncing in an effect on open). Every close path
	// goes through here, so the next open always starts from `initialValue`.
	function close() {
		setValue(initialValue);
		onClose();
	}

	function submit() {
		const trimmed = value.trim();
		if (!trimmed) return;
		setValue(initialValue);
		onSubmit(trimmed);
	}

	return (
		<Modal
			open={open}
			onClose={close}
			title={title}
			maxWidth={440}
			footer={
				<>
					<button type="button" className="btn btn-ghost" onClick={close}>
						{cancelLabel}
					</button>
					<button type="button" className="btn btn-primary" disabled={!value.trim()} onClick={submit}>
						{submitLabel}
					</button>
				</>
			}
		>
			<form
				className={styles.body}
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				{message && <p className={styles.message}>{message}</p>}
				<input
					className={styles.input}
					value={value}
					placeholder={placeholder}
					autoFocus
					aria-label={title}
					onChange={(e) => setValue(e.target.value)}
				/>
			</form>
		</Modal>
	);
}
